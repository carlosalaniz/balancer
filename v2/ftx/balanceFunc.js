const { ftx } = require("./ftx");
const { UserModel, TransactionModel } = require("../database");
module.exports = async function (user_id, balanceTo) {
    const future = 'BAL-PERP';
    
    balanceTo = +balanceTo;

    var user = await UserModel.findById(user_id).populate("transactions").exec();

    let min_delta = user.trade_settings.min_delta;
    let max_delta = user.trade_settings.max_delta;

    let ftxClient = new ftx(user.trade_settings.ftx.FTX_KEY, user.trade_settings.ftx.FTX_SECRET);

    try {
        let start_position = (await ftxClient.getPosition(future)).size;
        let delta = (start_position - balanceTo.toFixed(2)).toFixed(2);
        let absDelta = Math.abs(delta);
        let transaction = null;
        let pendingTransactions = user.transactions.filter(e => e.status === "PENDING");

        if (+delta !== 0 && pendingTransactions.length === 0) {
            var transactionObject = {
                _transactor: user._id,
                amount: undefined,
                side: undefined,
                market: future,
                position_before_transaction: undefined,
                position_after_transaction: undefined,
                status: undefined
            }
            transactionObject.position_before_transaction = start_position;
            transactionObject.amount = absDelta;
            if (absDelta >= min_delta && absDelta <= max_delta) {
                if (delta > 0) {
                    await ftxClient.goLongBy(absDelta, future);
                    transactionObject.side = "BUY";
                } else {
                    await ftxClient.goShortBy(absDelta, future);
                    transactionObject.side = "SELL";
                }
                transactionObject.status = "COMPLETE";
                transactionObject.position_after_transaction = (await ftxClient.getPosition(future)).size;
            } else {
                // handle pending transaction
                transactionObject.status = "PENDING";
                if (delta > 0) {
                    transactionObject.side = "BUY";
                } else {
                    transactionObject.side = "SELL";
                }
            }
            transaction = await TransactionModel.create(transactionObject);
            await transaction.save();
        }

        if (transaction) {
            user.transactions.push(transaction);
            if (transactionObject.status === "COMPLETE") {
                user.last_position = transactionObject.position_after_transaction;
            }
            await user.save();
        }

        if (pendingTransactions.length > 0) {
            return pendingTransactions[0];;
        } else {
            return transaction;
        }
    } catch (e) {
        console.error(e);
        throw e;
    }
}