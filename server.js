

require("dotenv").config();
const mongoose = require('mongoose');
const { connectToDbAsync } = require("./database");
connectToDbAsync().then(database => {
    const UserModel = database.models.User;
    const TransactionModel = database.models.Transaction;
    const { MonitorManager } = require("./monitor-manager");

    /** @type {Object.<string, MonitorManager>} */
    const UserMonitorManagerMap = {};
    async function initializeUserMonitors() {
        //This method initializes all user's monitors.
        const users = await UserModel.find().exec();
        users.forEach(user => {
            UserMonitorManagerMap[user._id.toString()] = new MonitorManager(user, database);
        });
    }


    const { BPoolMonitor } = require("./bpool/index");
    const { hash, compare } = require("./hash");
    const express = require('express');
    const router = express.Router();
    const app = express();
    const app_routing_prefix = process.env.APP_ROUTING_PREFIX || "/";

    router.get("/", _user, async function (req, res) {
        const user = await UserModel.findById(req.session.user._id);
        const monitorManager = UserMonitorManagerMap[user._id.toString()];
        const monitors = await Promise.all(
            monitorManager.get()
                .map(async monitor => await monitor.state())
        );
        res.render('home', {
            monitors: monitors
        });
    });

    router.get("/login", _guest, async function (req, res) {
        res.render('login');
    });
    router.post("/login", _guest, async function (req, res) {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email: email }).exec();
        if (user && compare(password, user.password)) {
            req.session.user = {
                _id: user._id.toString(),
                email: user.email
            };
            if(!UserMonitorManagerMap[user._id.toString()]){
                UserMonitorManagerMap[user._id.toString()] = new MonitorManager(user, database);
            }
        }
        res.redirect("back");
    });
    router.get("/logout", _user, async function (req, res) {
        req.session.destroy();
        res.redirect("back");
    });

    router.get("/register", _guest, async function (req, res) {
        res.render('register')
    });
    router.post("/register", _guest, async function (req, res) {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email: email }).exec();
        if (user) {
            req.session.flash = "error:Invalid data";
            res.redirect("back");
        } else {
            let newUser = await UserModel.create({
                email: email,
                password: hash(password),
                monitors: []
            });
            req.session.user = {
                _id: newUser._id.toString(),
                email: newUser.email
            };
            if(!UserMonitorManagerMap[newUser._id.toString()]){
                UserMonitorManagerMap[newUser._id.toString()] = new MonitorManager(newUser, database);
            }
            res.redirect("back");
        }

    });

    router.get("/monitor", _user, async function (req, res) {
        res.render('create_monitor');
    });

    router.post("/monitor", _user, async function (req, res) {
        const {
            pool_contract_address,
            token_address,
            wallet_address,
            market,
            min_delta,
            max_delta,
            refresh_rate,
            ftx_key,
            ftx_secret
        } = req.body;
        try {

            const user = await UserModel.findOne({ email: req.session.user.email }).exec();
            const monitorManager = UserMonitorManagerMap[user._id.toString()];
            const monitor = await user.monitors.create({
                pool_contract_address: pool_contract_address,
                token_address: token_address,
                wallet_address: wallet_address,
                market: market,
                state: BPoolMonitor.MONITORSTATUS.STOPPED,
                trade_settings: {
                    min_delta: +min_delta,
                    max_delta: +max_delta,
                    refresh_rate: +refresh_rate,
                    ftx: {
                        FTX_KEY: ftx_key,
                        FTX_SECRET: ftx_secret
                    }
                }
            });
            user.monitors.push(monitor);
            monitorManager.add(monitor.toObject());
            await user.save();
        } catch (e) {
            console.log(e);
            req.session.flash = "error: " + JSON.stringify(e);
        }
        res.redirect("back");
    });
    router.get("/monitor/:id", _user, async function (req, res) {
        const { id } = req.params;
        const monitorManager = UserMonitorManagerMap[req.session.user._id];
        let monitor = monitorManager.get(id);
        if (monitor) {
            res.render("monitor", {
                monitor: await monitor.toJson()
            });
        } else {
            res.redirect("..");
        }
    });
    router.get("/monitor/:id/transactions", _user, async function (req, res) {
        const { id } = req.params;
        const monitorManager = UserMonitorManagerMap[req.session.user._id];
        let monitor = monitorManager.get(id);
        if (monitor) {
            const transactions = await TransactionModel.find({ _monitor: new mongoose.Types.ObjectId(id) }).exec();
            res.render("transactions", {
                monitor_id: id,
                transactions: transactions
            })
        } else {
            res.redirect("..");
        }
    });
    router.post("/monitor/:id/transactions/:transaction_id/:action", _user, async function (req, res) {
        const { id, transaction_id, action } = req.params;
        const monitorManager = UserMonitorManagerMap[req.session.user._id];
        let monitor = monitorManager.get(id);
        if (monitor) {
            const transaction = await TransactionModel.findOne({
                _monitor: new mongoose.Types.ObjectId(id),
                _id: new mongoose.Types.ObjectId(transaction_id),
            }).exec();
            if (transaction && transaction.status === 'PENDING') {
                switch (action) {
                    case "approve":
                        await monitor.completePendingTransation(transaction_id);
                        break;
                    case "reject":
                        transaction.status = "REJECTED"
                        await transaction.save();
                        break;
                }
            }
        }
        res.redirect("back");
    });
    router.post("/monitor/:id/:action", _user, async function (req, res) {
        const { id, action } = req.params;
        const monitorManager = UserMonitorManagerMap[req.session.user._id];
        let monitor = monitorManager.get(id);
        if (monitor) {
            let state = await monitor.state();
            const user = await UserModel.findById(req.session.user._id).exec();
            const mUIndx = user.monitors.findIndex(m => m._id.toString() === id);
            switch (action) {
                case "start":
                    if (state.status !== BPoolMonitor.MONITORSTATUS.RUNNING) {
                        user.monitors[mUIndx].state = BPoolMonitor.MONITORSTATUS.RUNNING;
                        await user.save();
                        await monitor.start();
                        req.session.flash = `monitor ${id} started!`
                    }
                    break;
                case "stop":
                    if (state.status === BPoolMonitor.MONITORSTATUS.RUNNING) {
                        user.monitors[mUIndx].state = BPoolMonitor.MONITORSTATUS.STOPPED;
                        await user.save();
                        await monitor.stop();
                        req.session.flash = `monitor ${id} stopped!`
                    }
                    break;
                case "remove":
                    await user.monitors.id(id).remove();
                    await user.save();
                    await monitor.remove();
                    req.session.flash = `monitor ${id} removed!`
            }
        }
        res.redirect("../..");
    });

    const express_session = require('express-session');
    const session = {
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    };

    function _guest(req, res, next) {
        if (req.session.user) {
            res.redirect(301, app_routing_prefix);
            return;
        }
        next();
    }

    function _user(req, res, next) {
        if (!req.session.user) {
            let source = req.originalUrl;
            res.redirect(301, `${(app_routing_prefix.length > 1) ? app_routing_prefix : ""}/login?redirect=${source}`);
            return;
        }
        res.locals.loggedIn = true;
        next();
    }

    function _nocache(req, res, next) {
        res.set('Cache-Control', 'no-store')
        next()
    }

    app.use(express_session(session))
    app.use(express.urlencoded());
    app.set('view engine', 'ejs');
    app.use(express.static('public'))
    app.use(_nocache);
    app.set('etag', false)
    //include path name in all routes
    app.use((req, res, next) => {
        res.locals.pathname = (app_routing_prefix.length > 1) ? req.path.replace(app_routing_prefix, "") : req.path;
        if (req.session.user) {
            res.locals.user = req.session.user;
        }
        if (req.session.flash) {
            res.locals.flash_message = req.session.flash;
            delete req.session.flash;
        }
        next();
    })


    app.use("/", router);
    app.locals = {
        site: {
            app_routing_prefix: (app_routing_prefix.length > 1) ? app_routing_prefix : ""
        },
    }
    initializeUserMonitors(database);
    app.listen(process.env.APPLICATION_PORT);
    console.log(`Listening to port ${process.env.APPLICATION_PORT}`)
});







