const bcrypt = require("bcryptjs")
const saltRounds = process.env.SALT_ROUNDS || 10;


module.exports = {
    hash(text) {
        let salt = bcrypt.genSaltSync(+saltRounds);
        return bcrypt.hashSync(text, salt)
    },
    compare(text, hash) {
        return bcrypt.compareSync(text, hash);
    }
}