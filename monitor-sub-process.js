
if (!process.send) {
    process.exit("This process is meant to be used as a fork, it cannot be ran as a standalone program");
}

const { BPoolMonitor } = require("./bpool/index");
const { onNewValue, doTransaction, getFtxClient } = require("./ftx/balanceFunc")

require("./database").connectToDbAsync().then(async (database) => {
    //TODO: properly document this child process.
    const user_id = process.argv[2];
    const monitor_id = process.argv[3];
    if (!user_id || !monitor_id) {
        process.exit(`user id must be the first argument and monitor id the second.`);
    }

    const UserModel = database.models.User;
    const TransactionModel = database.models.Transaction;
    const user = await UserModel.findById(user_id).exec();
    if (!user) {
        process.exit(`User not found.`);
    }

    const monitorConfiguration = user.monitors.toObject().filter(m => m._id.toString() === monitor_id)[0];
    monitorConfiguration._id = monitorConfiguration._id.toString();

    if (!monitorConfiguration) {
        process.exit(`Monitor not found.`);
    }


    async function onNewValueAdquired(value, instance) {
        let transaction = await onNewValue(user_id, +value, monitorConfiguration.market,
            monitorConfiguration._id,
            UserModel,
            TransactionModel,
            {
                min_delta: monitorConfiguration.trade_settings.min_delta,
                max_delta: monitorConfiguration.trade_settings.max_delta,
                FTX_KEY: monitorConfiguration.trade_settings.ftx.FTX_KEY,
                FTX_SECRET: monitorConfiguration.trade_settings.ftx.FTX_SECRET,
            })

        switch ((transaction) ? transaction.status : transaction) {
            case "PENDING":
                var reason = "Tansaction Pending";
            case "REJECTED":
                instance.stop(typeof reason !== 'undefined' ? reason : undefined);
                const user = await UserModel.findById(user_id).exec();
                const mUIndx = user.monitors.findIndex(m => m._id.toString() === monitorConfiguration._id);
                user.monitors[mUIndx].state = BPoolMonitor.MONITORSTATUS.STOPPED_DUE_TO_EXTERNAL_REASON;
                await user.save();
            }

    }

    // instanciate monitor
    const monitor = new BPoolMonitor(
        monitorConfiguration.infura_key,
        monitorConfiguration.wallet_address,
        monitorConfiguration.pool_contract_address,
        monitorConfiguration.token_address,
        monitorConfiguration.trade_settings.refresh_rate,
        onNewValueAdquired,
        {
            wallet_address: monitorConfiguration.wallet_address,
            pool_contract_address: monitorConfiguration.pool_contract_address,
            token_address: monitorConfiguration.token_address,
            refresh_rate: monitorConfiguration.trade_settings.refresh_rate,
            monitoring_market: monitorConfiguration.market,
            min_delta: monitorConfiguration.trade_settings.min_delta,
            max_delta: monitorConfiguration.trade_settings.max_delta,
        }
    )

    async function completeTransaction(transaction_id) {
        let ftxClient = getFtxClient(
            monitorConfiguration.trade_settings.ftx.FTX_KEY,
            monitorConfiguration.trade_settings.ftx.FTX_SECRET
        )
        let transaction = await TransactionModel.findById(transaction_id).exec()
        if (transaction) {
            await doTransaction(ftxClient, transaction.amount, transaction.market, transaction);
            await transaction.save();
        }
    }
    // message format command:param1:param2:...:paramN
    process.on('message', async commandString => {
        let commandSplit = commandString.split(":");
        let command = commandSplit[0];
        let argv = commandSplit.slice(1);
        try {
            let response = "OK";
            switch (command) {
                case "complete":
                    const transaction_id = argv[0];
                    await completeTransaction(transaction_id)
                    break;
                case "start":
                    monitor.start();
                    break;
                case "stop":
                    if (argv.length > 0) {
                        let reason = argv[0];
                        monitor.stop(reason);
                    } else {
                        monitor.stop();
                    }
                    break;
                case "current-state":
                    let state = {
                        metadata: monitor.metadata,
                        ...monitor.state
                    }
                    response = state;
                    break;
                default:
                    response = "Command not found";
            }
            process.send(`${command}:${JSON.stringify(response)}`);
        } catch (e) {
            process.send(`${command}:Error:${e}`);
        }
    });

    process.send(`create:${JSON.stringify("OK")}`);
    // setTimeout(()=>{process.exit(1)},3000)
});
