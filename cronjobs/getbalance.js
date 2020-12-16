const path = require("path");
require("dotenv").config({
    path:
        path.resolve("../.env")
});
const Web3 = require('web3');
const Bpool = require("../bpool/BPool.json");
const { BinanceExchange, FTXExchange, CoinbaseExchange } = require("./exchanges");
var web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/8ccf688043c7498c81dbf85d6822e014"));
var cron = require('node-cron');
const { connectToDbAsync } = require("../database");

const EXCHANGES = {
    FTX: new FTXExchange("k5wFuos6RP89rhuADliG2T6TqwV9O8lBplcZHUqT", "e1N-n2zFr1yczYDexWOwGO-auLRLtkrgIs707LMD"),
    Binance: new BinanceExchange("lyVrXkw0S3cMaImJs5i19Yl4ZRW4Ua4xE5iaZw3OKa7gimq7DebWCSYzI8BrML0i", "0sX8Xj3CsXdfx3dT8ssnRy5AM6CmdxsMAKAFyEmANENdscyh9Z38N5Xoiu8bnhLO"),
    CoinBase: new CoinbaseExchange(),
}

const TokenMetadata = {
    "0xba100000625a3754423978a60c9317c58a424e3D": {
        name: "BAL",
        decimals: 18,
        exchanges: [
            EXCHANGES.FTX,
            EXCHANGES.Binance,
            EXCHANGES.CoinBase
        ]
    },
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": {
        name: "WETH",
        exchange_names: {
            FTX: "ETH",
            BINANCE: "ETH",
            COINBASE: "ETH"
        },
        decimals: 18,
        exchanges: [
            EXCHANGES.FTX,
            EXCHANGES.Binance,
            EXCHANGES.CoinBase
        ]
    },
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": {
        name: "USDC",
        decimals: 6,
        stable: true,
        currency: "USD",
        exchanges: []
    }
}

var getPoolWalletMetadata = async (
    poolAddress,
    walletAddress,
    currencies_to_observe) => {
    let smartContract = new web3.eth.Contract(Bpool.abi, poolAddress);

    let totalShares = +await smartContract.methods.totalSupply().call();
    let walletBalance = +await smartContract.methods.balanceOf(walletAddress).call();

    let tokens = await smartContract.methods.getCurrentTokens().call();
    return {
        pool_address: poolAddress,
        wallet_address: walletAddress,
        currencies: currencies_to_observe,
        recorded_at: +new Date(),
        tokens: await Promise.all(
            tokens.map(async tokenAddress => {
                let tokenMetaData = TokenMetadata[tokenAddress];
                let tokenBalance = +await smartContract.methods.getBalance(tokenAddress).call();
                let balance = (tokenBalance / totalShares) * walletBalance;
                let normalizedBalance = balance / Math.pow(10, +tokenMetaData.decimals);
                let exchanges = tokenMetaData && tokenMetaData.exchanges;
                var exchangeRates = exchanges ?
                    await Promise.all(
                        exchanges.map(async exchange => {
                            let exchange_name = exchange.getName();
                            return {
                                exchange_name: exchange_name,
                                rates: await Promise.all(currencies_to_observe.map(async currencyCode => {
                                    if (!tokenMetaData.stable || tokenMetaData.currency !== currencyCode) {
                                        let tokenName = (tokenMetaData.exchange_names &&
                                            tokenMetaData.exchange_names[exchange_name]
                                        ) || tokenMetaData.name;
                                        return {
                                            currency: currencyCode,
                                            rate: await exchange.getRateAsync(tokenName, currencyCode)
                                        }
                                    }
                                }))
                            }
                        })
                    ) : "token exchange definition not found";

                return {
                    token_address: tokenAddress,
                    stable: tokenMetaData && (tokenMetaData.stable) ? true : false,
                    token_name: tokenMetaData && tokenMetaData.name,
                    token_balance: normalizedBalance,
                    exchange_rates: exchangeRates
                }
            })
        )
    }
};

async function check(db) {
    let date = new Date();
    console.log("checking..." + date.toLocaleDateString() + " " + date.toLocaleTimeString())
    let users = await db.models.User.find().exec();
    users.forEach(async userModel => {
        let user = userModel.toObject();
        user.monitors && user.monitors.forEach(async m => {
            let metadata = await getPoolWalletMetadata(
                m.pool_contract_address,
                m.wallet_address,
                ["USD"]
            );
            let ftx = new FTXExchange(
                m.trade_settings.ftx.FTX_KEY,
                m.trade_settings.ftx.FTX_SECRET,
                m.trade_settings.ftx.SUBACCOUNT || undefined
            );
            let open_postion = await ftx.getPosition(m.market);
            metadata.open_postion = open_postion.size;
            let log = new db.models.BalanceLog(metadata);
            await log.save();
            console.log("Log saved.")
        })
    })
}

connectToDbAsync()
    .then(async db => {
        console.log("connected");
        cron.schedule('00 00 00,12 * * *', check(db))
    });




