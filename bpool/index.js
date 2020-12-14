const Web3 = require('web3');
const wait = require("../wait");
const Bpool = require("./BPool.json")


class BPoolMonitor {
    static MONITORSTATUS = {
        STOPPED_DUE_TO_EXTERNAL_REASON: 'STOPPED_DUE_TO_EXTERNAL_REASON',
        STOPPED: 'STOPPED',
        RUNNING: 'RUNNING',
    }

    constructor(
        infuraKey,
        walletAddress,
        poolContractAddress,
        tokenAddress,
        valueRefreshTime,
        onNewValue,
        metadata
    ) {
        this.web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/" + infuraKey));
        this.smartContract = new this.web3.eth.Contract(Bpool.abi, poolContractAddress);


        this.walletAddress = walletAddress;
        this.poolAddress = poolContractAddress;
        this.tokenAddress = tokenAddress;

        this.valueRefreshTime = valueRefreshTime;
        this.onNewValue = onNewValue;
        this.poolContractAddress = poolContractAddress;
        this.metadata = metadata;

        this.watchTokenIsValid = new Promise((resolve, reject) => {
            this.smartContract.methods.getCurrentTokens().call().then(poolTokens => {
                if (!poolTokens.includes(this.tokenAddress)) {
                    reject(`Token ${this.tokenAddress} is not valid for pool ${this.poolContractAddress}`);
                }
                resolve();
            });
        });

        // State management
        this.state = {
            startedAt: null,
            lastUpdatedAt: null,
            lastValue: null,
            status: BPoolMonitor.MONITORSTATUS.STOPPED,
            reason: undefined,
            waitingForValue: false,
            stopSignal: false
        }
    }

    async getBpoolBalance() {
        try {
            await this.watchTokenIsValid;
            // Coin/Pool Address
            let poolTokenBalance = +await this.smartContract.methods.getBalance(this.tokenAddress).call();

            // Total Bpt supply
            let totalShares = +await this.smartContract.methods.totalSupply().call();

            // Wallet Balance 
            let walletBalance = +await this.smartContract.methods.balanceOf(this.walletAddress).call();

            let myBalance = (poolTokenBalance / totalShares) * walletBalance;
            console.log("All calls successful, balance:", myBalance);
            return myBalance / Math.pow(10, await this.smartContract.methods.decimals().call());
        } catch (e) {
            console.error(e);
            this.stop(e);
        }
    }

    async cycle() {
        let newBpoolValue = await this.getBpoolBalance();
        if (newBpoolValue) {
            this.state.lastUpdatedAt = new Date();
            this.state.lastValue = newBpoolValue;
            if (this.onNewValue.constructor.name === "AsyncFunction") {
                await this.onNewValue(newBpoolValue, this);
            } else {
                this.onNewValue(newBpoolValue, this);
            }
            if (!this.state.stopSignal && !this.state.waitingForValue) {
                await wait(this.valueRefreshTime);
                await this.cycle();
            }
        }
    }

    start() {
        this.state.startedAt = new Date();
        this.state.stopSignal = false;
        this.state.status = BPoolMonitor.MONITORSTATUS.RUNNING;
        this.cycle();
    }

    stop(reason) {
        if (reason) {
            this.state.reason = reason;
            this.state.status = BPoolMonitor.MONITORSTATUS.STOPPED_DUE_TO_EXTERNAL_REASON;
        } else {
            this.state.status = BPoolMonitor.MONITORSTATUS.STOPPED;
        }
        this.state.stopSignal = true;
    }

    static id(walletAddress, poolAddress) {
        return [walletAddress, poolAddress].join(",");
    }

    getId() {
        return BPoolMonitor.id(this.walletAddress, this.poolAddress);
    }

    toObject() {
        return {
            state: this.state,
            metadata: this.metadata,
            poolAddress: this.poolAddress,
            walletAddress: this.walletAddress
        }
    }
}

















class BPoolMonitorManager {
    static MONITORSTATES = {
        STOPPED_DUE_TO_EXTERNAL_REASON: 'STOPPED_DUE_TO_EXTERNAL_REASON',
        STOPPED: 'STOPPED',
        RUNNING: 'RUNNING',
    }

    constructor() {
        this.ActiveMonitors = {};
    }

    list() {
        return Object.keys(this.ActiveMonitors)
            .reduce((reducer, current) => {
                let walletPool = current.split(",");
                if (!reducer[walletPool[1]]) {
                    reducer[walletPool[1]] = {};
                }
                reducer[walletPool[1]][walletPool[0]] =
                    this.ActiveMonitors[current].state;
                return reducer;
            }, {})
    }

    create(walletAddress, poolAddress, valueRefreshTime, onNewValue) {
        let monitorId = BPoolMonitor.id(walletAddress, poolAddress);
        if (!this.ActiveMonitors[monitorId]) {
            this.ActiveMonitors[monitorId] =
            {
                state: BPoolMonitorManager.MONITORSTATES.STOPPED,
                monitor: new BPoolMonitor(walletAddress, poolAddress, valueRefreshTime, onNewValue)
            };
            return this.get(walletAddress, poolAddress);
        } else {
            throw "Monitor is already defined";
        }
    }

    get(walletAddress, poolAddress) {
        let monitorId = BPoolMonitor.id(walletAddress, poolAddress);
        if (this.ActiveMonitors[monitorId]) {
            let parent = this;
            return {
                remove: function () {
                    delete parent.ActiveMonitors[monitorId];
                },
                state: function () {
                    return parent.ActiveMonitors[monitorId].state;
                },
                start: function () {
                    parent.ActiveMonitors[monitorId].monitor.start();
                    parent.ActiveMonitors[monitorId].state = BPoolMonitorManager.MONITORSTATES.RUNNING;
                    delete parent.ActiveMonitors[monitorId].reason;
                },
                stop: function (reason) {
                    parent.ActiveMonitors[monitorId].monitor.stop();
                    if (!reason) {
                        parent.ActiveMonitors[monitorId].state = BPoolMonitorManager.MONITORSTATES.STOPPED;
                    } else {
                        parent.ActiveMonitors[monitorId].state = BPoolMonitorManager.MONITORSTATES.STOPPED_DUE_TO_EXTERNAL_REASON;
                        parent.ActiveMonitors[monitorId].reason = reason;
                    }
                },
                replace: function (valueRefreshTime, onNewValue) {
                    delete parent.ActiveMonitors[monitorId];
                    parent.ActiveMonitors[monitorId] = {
                        state: BPoolMonitorManager.MONITORSTATES.STOPPED,
                        monitor: new BPoolMonitor(walletAddress, poolAddress, valueRefreshTime, onNewValue)
                    };
                },
                setRefreshTime(newTime) {
                    parent.ActiveMonitors[monitorId].monitor.valueRefreshTime = newTime;
                },
                toObject: function () {
                    let monitor = parent.ActiveMonitors[monitorId].monitor;
                    return {
                        state: this.state(),
                        reason: parent.ActiveMonitors[monitorId].reason,
                        id: monitorId,
                        refreshTime: monitor.valueRefreshTime,
                        startedAt: monitor.startedAt,
                        lastValue: monitor.lastValue,
                        lastUpdatedAt: monitor.lastUpdatedAt,
                    }
                }
            }
        } else {
            return null;
        }
    }
}

module.exports = {
    BPoolMonitorManager, BPoolMonitor
}


// let manager = new BPoolMonitorManager();


// let past = new Date();
// let monitor = manager.create("0x9d017314C142014b728DB33fD8dADbC3c7A99D61", "0xba100000625a3754423978a60c9317c58a424e3d", 2,
//     r => {
//         console.log(r.toFixed(2), "time: " + (new Date() - past) / 1000 + "s");
//         past = new Date();
//     });


// monitor.start();


// console.log(manager.list());
// setTimeout(async () => {
//     monitor.stop();
//     console.log(monitor.state());
//     console.log(manager.list());
//     console.log(monitor.toObject());
//     await wait(5)
// }, 10 * 1000)