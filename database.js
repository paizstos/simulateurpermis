// Import Sequelize
const { name } = require('ejs');
const { Sequelize, DataTypes, Model, Op, INTEGER } = require('sequelize')
var db = {};
const Bcrypt = require("bcryptjs");

// Creation of database link
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "preparatoryproject.sqlite"
})

class User extends Model{}

class User_Email extends Model{}

class Scores extends Model{}




User.init({
    name: {
        type: DataTypes.TEXT,
        primaryKey: true,
        allowNull: false,
        unique: true
    },
    pswd: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    subscriptionType: {  // Ajout du type d'abonnement
        type: DataTypes.ENUM('free', 'paid'),
        allowNull: false,
        defaultValue: 'free'
    },
    score:{
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    sequelize,
    modelName: 'User'
});

Scores.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
    },
    user_name: {
        type: DataTypes.TEXT,
        references: {
            model: User,
            key: 'name'
        },
        allowNull: false
    },
    result: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    sequelize,
    modelName: 'Scores'
});

User_Email.init({
    id : {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        unique: true,
    },
    mail: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    user_name: {
        type: DataTypes.TEXT,
        references: {
            model: User,
            key: 'name'
        }
    }
}, {
    sequelize,
    modelName: 'User_Email'
});





db.sequelize = sequelize;
db.Sequelize = Sequelize;
db.user = User;
db.user_email = User_Email;
db.Op = Op;
db.scores = Scores;




(async () => {
    await db.sequelize.sync({ force: true });
});
  

// db.sequelize.sync({force: true});  





module.exports = db;

