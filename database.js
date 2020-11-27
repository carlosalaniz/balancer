const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Transactions
const TransactionModel = mongoose.model('Transaction',
    new Schema({
        _transactor: { type: Schema.Types.ObjectId, ref: 'User' },
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
    wallet_address: {
        type: 'string',
        index: true,
        unique: true,
        lowercase: true
    },
    email: {
        type: 'string',
        index: true,
        unique: true,
        lowercase: true
    },
    password: 'string',
    last_position: 'number',
    trade_settings: {
        ftx: {
            type: {
                FTX_KEY: "string",
                FTX_SECRET: "string"
            },
            required: true
        },
        min_delta: {
            type: 'number',
            default: 0.01
        },
        max_delta: {
            type: 'number',
        },
        refresh_rate: {
            type: 'number',
        }
    },
    transactions: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }]
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
