const child_process = require('child_process');
const { defer } = require('./defer.js');
const path = require('path');
const { BPoolMonitor } = require('./bpool/index.js');

const program = path.resolve('monitor-sub-process.js');
const getParamaters = (user_id, monitor_id) => [user_id, monitor_id];
const options = { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] };

class MonitorManager {
    constructor(userModel, database) {
        this.database = database;
        this.messageQueue = {};
        this.user_id = userModel._id;
        this.userMonitors = {};
        userModel.monitors.toObject().forEach(m => this.addMonitor(m));
        this.process_kill = {};
        var manager = this;
        return {
            async add(monitor) {
                await manager.addMonitor(monitor);
                return this.get(monitor._id);
            },
            get(m_id) {
                if (m_id) {
                    var monitor = manager.getMonitor(m_id);
                    if (monitor) {
                        return manager.monitorManagementInterface(monitor);
                    }
                }
                return Object.keys(manager.userMonitors)
                    .map(k => manager.monitorManagementInterface(manager.getMonitor(k)));
            }
        }
    }

    monitorManagementInterface(monitor) {
        var manager = this;
        return {
            async completePendingTransation(transaction_id) {
                return await manager.completePendingTransation(monitor._id, transaction_id);
            },
            async start() {
                return await manager.startMonitor(monitor._id);
            },
            async stop() {
                return await manager.stopMonitor(monitor._id);
            },
            async state() {
                return await manager.getCurrentState(monitor._id);
            },
            async remove() {
                return await manager.removeMonitor(monitor._id);
            }
        }
    }

    async completePendingTransation(m_id, transaction_id) {
        let monitor = this.getMonitor(m_id);
        if (!monitor.process_up) {
            this.instantiateMonitor(monitor);
            await monitor.process_up;
            await this.sendCommand(monitor, `complete:${transaction_id}`);
            await this.stopMonitor();
        }else{
            await this.sendCommand(monitor, `complete:${transaction_id}`);
        }
    }

    getMonitor(m_id) {
        return this.userMonitors[m_id];
    }

    async initMonitor(monitor) {
        // this method is executed when the box is up
        let monitorInitialState = monitor.state;
        if (monitorInitialState === BPoolMonitor.MONITORSTATUS.RUNNING) {
            await this.startMonitor(monitor._id);
        }
    }

    async addMonitor(monitor) {
        if (!this.getMonitor(monitor._id.toString())) {
            let newMonitor = this.mapMonitorToManagerMonitor(monitor);
            if (monitor.state === BPoolMonitor.MONITORSTATUS.RUNNING) {
                this.userMonitors[monitor._id.toString()] = newMonitor;
                this.instantiateMonitor(this.userMonitors[monitor._id.toString()]);
            } else {
                this.userMonitors[monitor._id.toString()] = newMonitor;
            }
        }
    }

    async removeMonitor(m_id) {
        let monitor = this.getMonitor(m_id);
        if (monitor.process_up) {
            await this.stopMonitor(m_id);
        }
        delete this.userMonitors[m_id];
    }

    mapMonitorToManagerMonitor(m) {
        let monitor = { ...m };
        monitor._id = monitor._id.toString();
        monitor.process = undefined;
        monitor.process_up = false;
        if (monitor && monitor.trade_settings && monitor.trade_settings.ftx) {
            delete monitor.trade_settings.ftx;
        }
        return monitor;
    }

    async sendCommand(monitor, command) {
        let m_id = monitor._id;
        if (!this.messageQueue[m_id]) {
            this.messageQueue[m_id] = {};
        }
        if (!this.messageQueue[m_id][command]) {
            // defer the command for when the process replies
            // todo: implement a timeout.
            monitor.process.send(command);
            this.messageQueue[m_id][command] = defer();
            return await this.messageQueue[m_id][command];
        }
    }

    // Commands
    async startMonitor(m_id) {
        let monitor = this.getMonitor(m_id)
        if (!monitor.process_up) {
            this.instantiateMonitor(monitor);
            await monitor.process_up;
        }
        return await this.sendCommand(monitor, "start");
    }

    async stopMonitor(m_id) {
        let monitor = this.getMonitor(m_id)
        if (monitor.process_up) {
            monitor.process_up = false;
            this.process_kill[m_id] = true;
            await this.sendCommand(monitor, "stop");
            if (monitor.process.kill()) {
                monitor.process = undefined;
            } else {
                throw "there's a problem!"
            }
        }
    }

    async getCurrentState(m_id) {
        let monitor = this.getMonitor(m_id)
        let user = await this.database.models.User.findById(this.user_id).exec()
        let dbMonitor = user.toObject().monitors.filter(m => m._id.toString() === m_id).pop();
        if (monitor.process_up) {
            let state = await this.sendCommand(monitor, "current-state");
            if (state) {
                return {
                    id: m_id,
                    transaction_count: dbMonitor.transactions.length,
                    pool_contract_address: state.metadata.pool_contract_address,
                    token_address: state.metadata.token_address,
                    wallet_address: state.metadata.wallet_address,
                    market: state.metadata.monitoring_market,
                    min_delta: state.metadata.min_delta,
                    max_delta: state.metadata.max_delta,
                    refresh_rate: state.metadata.refresh_rate,
                    status: state.status,
                    lastValue: state.lastValue,
                    lastUpdatedAt: state.lastUpdatedAt,
                }
            }
        }
        return {
            id: m_id,
            transaction_count: dbMonitor.transactions.length,
            pool_contract_address: dbMonitor.pool_contract_address,
            token_address: dbMonitor.token_address,
            wallet_address: dbMonitor.wallet_address,
            market: dbMonitor.market,
            min_delta: dbMonitor.trade_settings.min_delta,
            max_delta: dbMonitor.trade_settings.max_delta,
            refresh_rate: dbMonitor.trade_settings.refresh_rate,
            status: dbMonitor.state,

        }

    }

    // Process instantiation
    instantiateMonitor(monitor) {
        let forkParameters = getParamaters(this.user_id.toString(), monitor._id);

        // create new instance
        monitor.process_up = defer();
        let monitorInstance = child_process.fork(program, forkParameters, options);

        // bind listeners for messages and errors
        monitorInstance.on('message', (message) => {
            this.onMessageFromChildInstance(monitor._id, message)
        });
        monitorInstance.on('error', () => this.onChildInstanceExit(monitor, 1));
        monitorInstance.on('exit', (code, signal) => this.onChildInstanceExit(monitor, code, signal))

        // instance
        monitor.process = monitorInstance;
    }

    onMessageFromChildInstance(m_id, message) {
        let messageSplit = message.split(":");
        let command = messageSplit[0];
        let response = JSON.parse(messageSplit.slice(1).join(":"));
        let pendingCommand = this.messageQueue[m_id] && this.messageQueue[m_id][command];
        if (pendingCommand) {
            pendingCommand.resolve(response);
            delete this.messageQueue[m_id][command];
        } else if (command === "create") {
            let monitor = this.getMonitor(m_id);
            this.initMonitor(monitor);
            monitor.process_up.resolve();
        }
    }

    onChildInstanceExit(monitorData, code, signal) {
        if (this.process_kill[monitorData._id]) {
            delete this.process_kill[monitorData._id];
            return;
        }
        if (code || signal) {
            // try to restart
            let monitor = this.getMonitor(monitorData._id);
            monitor.process_up = false;
            monitor.process = this.instantiateMonitor(monitorData);
            console.log("Child", monitorData._id, "exited... restarting...")
        }
    }

}

module.exports = { MonitorManager };