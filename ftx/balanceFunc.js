const { ftx } = require("./ftx");
const { binance } = require("../binance/binance");
/**
 * 
 * @param {string} user_id 
 * @param {number} balanceTo 
 * @param {string} market 
 * @param {{ min_delta:string, max_delta:string, FTX_KEY:string, FTX_SECRET:string}} tradeSettings 
 * @returns {{status:string}}
 */
const onNewValue = async function (user_id, balanceTo, market, monitor_id,
    UserModel,
    TransactionModel,
    tradeSettings) {
    var user = await UserModel.findById(user_id).populate("monitors.transactions").exec();
    var m_index = user.monitors.toObject().findIndex(m => m._id.toString() === monitor_id);

    let min_delta = tradeSettings.min_delta;
    let max_delta = tradeSettings.max_delta;


    try {
        let exgClient = undefined;
        if (tradeSettings.FTX_KEY) {
            exgClient = getFtxClient(tradeSettings.FTX_KEY, tradeSettings.FTX_SECRET, tradeSettings.SUBACCOUNT);
        } else {
            exgClient = getBinanceClient(tradeSettings.BINANCE_KEY, tradeSettings.BINANCE_SECRET);
        }
        let start_position = (await exgClient.getPosition(market)).size;
        let delta = (start_position - balanceTo.toFixed(2)).toFixed(2);
        let absDelta = Math.abs(delta);
        let transaction = null;
        let pendingTransactions = user.monitors[m_index].transactions.filter(e => e.status === "PENDING");
        // Check if the value changed
        // if there's a pending transaction try balance.
        if (pendingTransactions.length > 0) {
            console.warn(monitor_id, "transactions pending, stopping monitor.")
            return pendingTransactions[0];
        }
        if (absDelta > 0) {
            // if there's a change and no pending transactions, try balance.
            // preparing the transaction object for persistance.
            let transactionObject = {
                _transactor: user._id,
                _monitor: user.monitors[m_index]._id,
                amount: delta,
                side: undefined,
                market: market,
                position_before_transaction: start_position,
                position_after_transaction: undefined,
                status: undefined
            }

            // Check if the trade amount is within the defined limits 
            if (absDelta >= min_delta && absDelta <= max_delta) {
                await doTransaction(exgClient, delta, market, transactionObject);
            } else {
                // if the tade ammount is not within the feined limits, create a pending transaction
                transactionObject.status = "PENDING";
                if (delta > 0) {
                    transactionObject.side = "BUY";
                } else {
                    transactionObject.side = "SELL";
                }
            }

            // persist transaction object.
            transaction = await TransactionModel.create(transactionObject);
            await transaction.save();

            // attach the newly created transaction to user and persist.
            user.monitors[m_index].transactions.push(transaction);
            if (transactionObject.status === "COMPLETE") {
                user.monitors[m_index].last_position = transactionObject.position_after_transaction;
            }
            await user.save();

            // return transaction
            return transaction;
        } else {
            //console.log(monitor_id, absDelta, "no change");
            return null;
        }
    } catch (e) {
        console.error(e);
        throw e;
    }
}
const getFtxClient = function (FTX_KEY, FTX_SECRET, SUBACCOUNT) {
    return new ftx(FTX_KEY, FTX_SECRET, SUBACCOUNT);
}
const getBinanceClient = function (KEY, SECRET) {
    return new binance(KEY, SECRET);
}

const doTransaction = async function (exchangeClient, amount, market, transactionObject) {
    // if it is attempt to perform a transaction
    const absAmount = Math.abs(amount);
    if (amount > 0) {
        await exchangeClient.goLongBy(absAmount, market);
        transactionObject.side = "BUY";
    } else {
        await exchangeClient.goShortBy(absAmount, market);
        transactionObject.side = "SELL";
    }

    // after the transaction is performed, update the transaction object.
    transactionObject.status = "COMPLETE";
    transactionObject.position_after_transaction = (await exchangeClient.getPosition(market)).size;
}

module.exports = {
    onNewValue, doTransaction, getFtxClient
}