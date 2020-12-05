const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Transactions
const TransactionModel = mongoose.model('Transaction',
    new Schema({
        _transactor: { type: Schema.Types.ObjectId, ref: 'User' },
        _monitor: { type: Schema.Types.ObjectId, ref: 'User.monitors' },
        amount: "number",
        side: {
            type: "string",
            enum: ['BUY', 'SELL'],
        },
        market: "string",
        position_before_transaction: "number",
        position_after_transaction: "number",
        status: {
            type: "string",
            enum: ['COMPLETE', 'PENDING', "REJECTED"],
        }
    }, { timestamps: true })
);


// Users
var UserSchema = new Schema({
    email: {
        type: 'string',
        index: true,
        unique: true,
        lowercase: true
    },
    password: 'string',
    monitors: [{
        last_position: 'number',
        pool_contract_address: "string",
        token_address:'string',
        wallet_address: {
            type: 'string',
            index: true,
        },
        market: "string",
        trade_settings: {
            min_delta: {
                type: 'number',
                default: 0.01
            },
            max_delta: {
                type: 'number',
            },
            refresh_rate: {
                type: 'number',
            },
            ftx: {
                type: {
                    FTX_KEY: "string",
                    FTX_SECRET: "string"
                },
                required: true
            }
        },
        state: "string",
        reason:"string",
        transactions: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }]
    }],
}, { timestamps: true });

UserSchema.methods.toSafeJSON = function () {
    var obj = this.toObject();
    delete obj.password;
    delete obj.trade_settings.ftx;
    obj.transaction_count = obj.transactions.length;
    delete obj.transactions;
    return obj;
};

const UserModel = mongoose.model('User', UserSchema);


async function connectToDbAsync() {
    mongoose.set('useCreateIndex', true);
    return await mongoose.connect(process.env.DATABASE_CONNECTION_STRING,
        {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
}

module.exports = {
    connectToDbAsync, UserModel, TransactionModel
}
