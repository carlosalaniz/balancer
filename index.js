require("dotenv").config();
const express = require('express')
const port = 3000;
const ftx = require("./ftx");

const app = express();
var cors = require('cors');
const axios = require("axios");
app.use(express.static('public'))
app.use(cors());
app.use(express.json());

app.post('/balance', async function (req, res) {
    var { balancer, min_delta } = req.body;
    balancer = +balancer;
    console.log(balancer, min_delta);
    const future = 'BAL-PERP';
    const ResultPayload = {
        future: future,
        start_position: null,
        balanceTo: +balancer,
        new_position: null,
        action_taken: "none",
        amount: "N/A"
    }
    try {
        let start_position = (await ftx.getPosition(future)).size;
        ResultPayload.start_position = start_position;
        let delta = (start_position - balancer.toFixed(2)).toFixed(2);
        console.log(`sp'${start_position}, b'${balancer}, btf'${balancer.toFixed(2)}, d'${delta}`);   
        if (+delta !== 0) {
            if (Math.abs(delta) >= min_delta) {
                ResultPayload.amount = Math.abs(delta);
                if (delta > 0) {
                    await ftx.goLongBy(Math.abs(delta), future);
                    ResultPayload.action_taken = "BUY";
                } else {
                    await ftx.goShortBy(Math.abs(delta), future);
                    ResultPayload.action_taken = "SELL";
                }
                ResultPayload.new_position = (await ftx.getPosition(future)).size;
            }
        }
        res.status(200).json(ResultPayload);
    } catch (e) {
        console.log(e);
        res.status(500).json(e);
    }
});


app.get("/", function (req, res) {
    res.send(`
    <html style="background:black; color:white; text-align:justify">
        <div style="width:80%; margin: 0 auto">
        <h1>Here be Dragons</h1>    
            <h2>
                "Here be Dragons" was a phrase frequently used in the 1700s and earlier by cartographers (map makers) 
                on faraway, uncharted corners of the map. It was meant to warn people away from dangerous areas where 
                sea monsters were believed to exist. It's now used metaphorically to warn people away from unexplored 
                areas or untried actions. There are no actual dragons, but it is still dangerous.
           </h2>
           <a href="./browser_script.js">Here be dragons</a> | 
           <a href="./tampermonkey.js">squidward.js</a>
        </div>
    </html>
    `);
});

console.log(`Listening on ${port}`);
app.listen(port)