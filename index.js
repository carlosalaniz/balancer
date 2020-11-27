require("dotenv").config();

var path = require('path');
const publicRoot = path.resolve(__dirname + "/public");
const { ftx } = require("./ftx");
const cors = require('cors');
const session = require('express-session')

const express = require('express');
const { hash, compare } = require("./hash");
const port = 3000;
const app = express();
const { createJWT, UseJwt, verifyJWT } = require("./jwt");
const { UserModel, TransactionModel, connectToDbAsync } = require("./database");
const { read } = require("fs");

function onlyGuest(req, res, next) {
    if (req.session.user) {
        res.redirect(301, '/');
        return;
    }
    next();
}

function onlyUser(req, res, next) {
    if (!req.session.user) {
        res.redirect(301, `/login?redirect=${req.originalUrl}`);
        return;
    }
    res.locals.loggedIn = true;
    next();
}

function validateJWT(req, res, next) {
    let { jwToken } = req.query
    if (jwToken) {
        let decoded = verifyJWT(jwToken);
        if (decoded !== -1) {
            UserModel.findById(decoded._id).exec().then(function (user) {
                req.session.user = user.toSafeJSON();
                next();
            });
            return;
        }
    }
    next();
}

// app.use(express.static('public'))
app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
app.set('view engine', 'ejs');
app.use(express.static('public'))
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
});
app.set('etag', false)
let sess = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
};

if (process.env.PRODUCTION) {
    app.set('trust proxy', 1) // trust first proxy
    sess.cookie.secure = true // serve secure cookies
}

app.use(session(sess))

app.get('/register', onlyGuest,
    async function (req, res) {
        res.render('register', {
            pathname: req.originalUrl
        });
    });

app.get("/login", onlyGuest,
    async function (req, res) {
        res.render('login', {
            pathname: req.originalUrl
        });
    }
);

app.get('/logout', onlyUser,
    function (req, res) {
        req.session.destroy(function (err) {
            res.redirect(301, '/login');
        })
    });

app.get('/test',
    async function (req, res) {
        let user = await UserModel.findOne({ email: "carloglvn93@gmail.com" })
            .populate('transactions')
            .exec();
        try {
            let transaction = new TransactionModel();
            transaction._transactor = user._id;
            transaction.amount = .75;
            transaction.side = "SELL";
            transaction.market = "BAL";
            transaction.position_before_transaction = 1.00;
            transaction.position_after_transaction = 1.75;
            transaction.status = "COMPLETE";
            transaction.save();
            user.transactions.push(
                transaction
            )
            await user.save();
            res.status(200).json(user.toSafeJSON());
        } catch (e) {
            res.status(500).json(e);
        }
    });

app.post('/do-register', onlyGuest,
    async function (req, res) {
        const {
            wallet_address,
            email,
            password,
            max_delta,
            min_delta,
            refresh_rate,
            FTX_KEY,
            FTX_SECRET
        } = req.body;
        try {
            let user = await UserModel.findOne({ email: email }).exec();
            if (user) {
                res.status(400).json("Bad Request")
                return;
            }
            let userObj = {
                email: email,
                wallet_address: wallet_address,
                password: hash(password),
                trade_settings: {
                    ftx: {
                        FTX_KEY: FTX_KEY,
                        FTX_SECRET: FTX_SECRET,
                    },
                    max_delta: (max_delta != '') ? +max_delta : 500,
                    min_delta: (min_delta != '') ? +min_delta : .01,
                    refresh_rate: (refresh_rate != '') ? +refresh_rate : 120,
                },
                transactions: []
            }
            let newUser = await UserModel.create(userObj);
            await newUser.save();
            let userJson = newUser.toSafeJSON();
            let jwt = createJWT(userJson);
            req.session.user = {
                jwt: jwt,
                data: userJson
            }
            res.status(200).json("OK");
        } catch (e) {
            console.error(e);
            res.status(500);
        }
    });

app.post("/do-login", onlyGuest,
    async function (req, res) {
        const {
            email,
            password,
        } = req.body;
        try {
            let user = await UserModel.findOne({ email: email })
                .populate('transactions')
                .exec();

            if (user) {
                if (compare(password, user.password)) {
                    let ftxClient = new ftx(user.trade_settings.ftx.FTX_KEY, user.trade_settings.ftx.FTX_SECRET);
                    let position = await ftxClient.getPosition('BAL-PERP');
                    user.last_position = position.size;
                    await user.save();
                    let userJson = user.toSafeJSON();
                    let jwt = createJWT(userJson);
                    req.session.user = {
                        jwt: jwt,
                        data: userJson
                    }
                    res.status(200).json("OK");
                    return;
                }
            }
            res.status(400).json("Bad Request")
        } catch (e) {
            console.error(e)
            res.status(500);
        }
    });

app.get("/transactions", onlyUser, async function (req, res) {
    const user = await UserModel.findById(req.session.user.data._id).populate("transactions").exec();
    res.render("transactions", {
        transactions: user.transactions,
        pathname: req.originalUrl
    });
});

app.get("/refresh-jwt", ...UseJwt(),
    async function (req, res) {
        let user = await UserModel.findById(req.user._id).exec();
        let ftxClient = new ftx(user.trade_settings.ftx.FTX_KEY, user.trade_settings.ftx.FTX_SECRET);
        let position = await ftxClient.getPosition('BAL-PERP');
        user.last_position = position.size;
        await user.save();
        let userJson = user.toSafeJSON();
        let jwt = createJWT(userJson);
        req.session.user = {
            jwt: jwt,
            data: userJson
        }
        res.status(200).json(jwt);
    }
);

app.post('/balance', ...UseJwt(), async function (req, res) {
    const future = 'BAL-PERP';

    var { balanceTo } = req.body;
    balanceTo = +balanceTo;

    var user = await UserModel.findById(req.user._id).populate("transactions").exec();

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

        let userJson = user.toSafeJSON();
        let jwt = createJWT(userJson);
        if (pendingTransactions.length > 0) {
            res.status(200).json({ transaction: pendingTransactions[0], jwt: jwt });
        } else {
            res.status(200).json({ transaction: transaction, jwt: jwt });
        }
    } catch (e) {
        console.log(e);
        res.status(500).json(e);
    }
});

app.post('/transactions/approve', onlyUser, async function (req, res) {
    let { transaction_id } = req.body;
    if (transaction_id) {
        let user = await UserModel.findById(req.session.user.data._id)
            .populate('transactions')
            .exec();
        let transactionSearch = user.transactions.filter(t => t._id.toString() === transaction_id);
        if (transactionSearch.length > 0) {
            let transaction = transactionSearch[0];
            let ftxClient = new ftx(user.trade_settings.ftx.FTX_KEY, user.trade_settings.ftx.FTX_SECRET);
            if (transaction.side === "SELL") {
                await ftxClient.goShortBy(transaction.amount, transaction.market);
            } else {
                await ftxClient.goLongBy(transaction.amount, transaction.market);
            }
            transaction.position_after_transaction = (await ftxClient.getPosition(transaction.market)).size;
            transaction.status = "COMPLETE"
            await transaction.save();
            res.redirect("/transactions");
        }
    } else {
        res.status(400).json("Bad Request");
    }
});

app.post('/transactions/reject', onlyUser, async function (req, res) {
    let { transaction_id } = req.body;
    if (transaction_id) {
        let user = await UserModel.findById(req.session.user.data._id)
            .populate('transactions')
            .exec();
        let transactionSearch = user.transactions.filter(t => t._id.toString() === transaction_id);
        if (transactionSearch.length > 0) {
            let transaction = transactionSearch[0];
            transaction.status = "REJECTED"
            await transaction.save();
            res.redirect("/transactions");
        }
    } else {
        res.status(400).json("Bad Request");
    }
});

app.post('/transaction-details', ...UseJwt(), async function (req, res) {
    var { transaction_id } = req.body;
    var user = await UserModel.findById(req.user._id).populate("transactions").exec();
    let transactionSearch = user.transactions.filter(t => t._id.toString() === transaction_id);
    if (transactionSearch.length > 0) {
        res.status(200).json(transactionSearch[0].toJSON());
        return;
    }
    res.status(404).json("NOT FOUND");
})

app.get('/get-injectable-code', async function (req, res) {
    res.render('ui-overlay', {
        service_base_url: process.env.SERVICE_BASE_URL
    });
});

app.get("/settings", onlyUser, function (req, res) {
    res.render('settings', {
        pathname: req.originalUrl,
        trade_settings: req.session.user.data.trade_settings
    });
});

app.post("/update-settings", onlyUser, async function (req, res) {
    let { max_delta, min_delta, refresh_rate } = req.body;
    if (max_delta || min_delta || refresh_rate) {
        let user = await UserModel.findById(req.session.user.data._id)
            .populate('transactions')
            .exec();
        if (max_delta) {
            user.trade_settings.max_delta = +max_delta;
        }
        if (min_delta) {
            user.trade_settings.min_delta = +min_delta;
        }
        if (refresh_rate) {
            user.trade_settings.refresh_rate = +refresh_rate;
        }

        await user.save();
        let userJson = user.toSafeJSON();
        let jwt = createJWT(userJson);
        req.session.user = {
            jwt: jwt,
            data: userJson
        };
    }
    res.redirect("/settings");
})

app.get("/", onlyUser, function (req, res) {
    res.render('home', {
        pathname: req.originalUrl,
        user: req.session.user,
        service_base_url: process.env.SERVICE_BASE_URL
    });
});

connectToDbAsync().then(() => {
    app.listen(port)
    console.log(`Listening on ${port}`);
})