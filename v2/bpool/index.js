const Web3 = require('web3');
const wait = function (time) {
    return new Promise((resolutionFunc, rejectionFunc) => {
        setTimeout(() => {
            resolutionFunc();
        }, time * 1000)
    })
}

class BPoolMonitor {
    constructor(walletAddress, poolAddress, valueRefreshTime, onNewValue) {
        this.Bpool = require("./BPool.json")
        this.walletAddress = walletAddress;
        this.poolAddress = poolAddress;
        this.valueRefreshTime = valueRefreshTime;
        this.onNewValue = onNewValue;
        this.web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/eeb133ef92054b6b972655a777493eca"));

        this.stopSignal = false;
        this.waitingForValue = false;

        this.startedAt = null;
        this.lastUpdatedAt = null;
        this.lastValue = null;
    }

    async getBpoolBalance() {
        try {
            var contract = new this.web3.eth.Contract(this.Bpool.abi, "0xe2eb726bce7790e57d978c6a2649186c4d481658");

            // Coin/Pool Address
            let poolTokenBalance = +await contract.methods.getBalance(this.poolAddress).call();


            // Total Bpt supply
            let totalShares = +await contract.methods.totalSupply().call();

            // Wallet Balance 
            let walletBalance = +await contract.methods.balanceOf(this.walletAddress).call();

            let myBalance = (poolTokenBalance / totalShares) * walletBalance;

            return myBalance / Math.pow(10, await contract.methods.decimals().call());

        } catch (e) {
            console.error(e);
        }
    }

    async cycle() {
        let newBpoolValue = await this.getBpoolBalance();
        this.lastUpdatedAt = new Date();
        this.lastValue = newBpoolValue;
        if (this.onNewValue.constructor.name === "AsyncFunction") {
            await this.onNewValue(newBpoolValue, this);
        } else {
            this.onNewValue(newBpoolValue, this);
        }
        await wait(this.valueRefreshTime);
        if (!this.stopSignal && !this.waitingForValue) {
            await this.cycle();
        }
    }

    start() {
        this.startedAt =new Date();
        this.stopSignal = false;
        this.cycle();
        return +new Date();
    }

    stop() {
        this.stopSignal = true;
    }

    static id(walletAddress, poolAddress) {
        return [walletAddress, poolAddress].join(",");
    }

    getId() {
        return BPoolMonitor.id(this.walletAddress, this.poolAddress);
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
    BPoolMonitorManager
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