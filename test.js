
require("dotenv").config();
const { response } = require("express");
const { UserModel, TransactionModel, connectToDbAsync } = require("./database");

connectToDbAsync().then(async () => {
    const { MonitorManager } = require("./monitor-manager");
    let user = await UserModel.findOne({ email: "carlosglvn93@gmail.com" }).exec();
    if (!user) {
        user = await UserModel.create({
            email: "carlosglvn93@gmail.com",
            password: "$2a$10$tcT/padiP4kYK3WrLEB1s.JL7NjaDtYJfIDrPjrhaftSrVLafGhRC",
            monitors: []
        });
    }
    let monitor = user.monitors.filter(m => m.pool_contract_address === "0xe2eb726bce7790e57d978c6a2649186c4d481658").pop();
    if (!monitor) {
        user.monitors.push({
            pool_contract_address: "0xe2eb726bce7790e57d978c6a2649186c4d481658",
            token_address: "0xba100000625a3754423978a60c9317c58a424e3D",
            wallet_address: "0x9d017314c142014b728db33fd8dadbc3c7a99d61",
            market: "BAL-PERP",
            state: "STOPPED",
            trade_settings: {
                min_delta: 0.01,
                max_delta: 0.04,
                refresh_rate: 30,
                ftx: {
                    FTX_KEY: "cwMMESI89fd7pyyRXqUp9NMhjetkl-qB111NOxTq",
                    FTX_SECRET: "lkWQRqLGM-4OmHXi35lB-i9UbNzPvZUveJlOX6QV"
                }
            }
        });
        await user.save();
    }

    leyt 


    let manager = await new MonitorManager(user);

    console.log("Starting...");
    await manager.get()[0].start();
    console.log("Started");

})

