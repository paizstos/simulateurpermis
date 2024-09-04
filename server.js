// Chargement des modules nécessaires
var express = require('express');
var session = require('express-session');
var app = express();
var bodyParser = require("body-parser");
var https = require('https');
var fs = require('fs');
const Bcrypt = require("bcryptjs");
const Stripe = require('stripe');
require('dotenv').config(); // Charge les variables d'environnement du fichier .env

const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // Utilise la clé API depuis les variables d'environnement

// Middleware pour analyser les données du formulaire
app.use(bodyParser.urlencoded({ extended: true }));

// Configuration des sessions
app.use(session({
    secret: "Christos1101",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      path: '/', 
      httpOnly: true, 
    }
}));

// Configuration de la base de données
const dbs = require("./database.js");
const { Op } = dbs; // Importation de l'opérateur Op

// Vérification de la connexion à la base de données
try {
    dbs.sequelize.authenticate();
    console.log('Connection has been established successfully.');
} catch (error) {
    console.error('Unable to connect to the database:', error);
}

// Configuration du moteur de template EJS
app.set('view engine', 'ejs');
app.set('views', __dirname + '/static');
app.use(express.static(__dirname + '/static'));
;

// Variables pour la gestion du temps et de la date
var ajd = new Date();
var months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]; 
var date = " " + ajd.getDate() + " " + months[ajd.getMonth()] + " " + ajd.getFullYear();

// Charger les questions depuis le fichier JSON
let allQuestions = JSON.parse(fs.readFileSync('questions.json'));

// Fonction pour sélectionner 5 questions aléatoirement
function getRandomQuestions() {
    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5);
}



// Route d'accueil
app.get('/', async (req, res) => {
    let noti = req.session.notif;
    if (req.session.username) {
        return res.redirect('/dashboard');
    } else {
        res.render('home', { 
            year: date,
            logine : "Se connecter / Choisir un plan ?",
            notif: noti 
        });
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    try {
        // Rechercher tous les scores pour l'utilisateur connecté
        const scores = await dbs.scores.findAll({
            where: { user_name: req.session.username },
            order: [['date', 'DESC']]  // Optionnel : trier par date décroissante
        }) ;

        // Rendre la vue dashboard avec la liste des scores
        res.render('dashboard', {
            username: req.session.username,
            scores: scores,
            timeLimit: 60, // Par exemple, une valeur par défaut pour la personnalisation du temps
            year: new Date().getFullYear(),
            logine: req.session.username + " (Déconnexion)"
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des scores:', error);
        res.status(500).send('Erreur lors de la récupération des scores');
    }
});

app.get('/config', (req, res) => {
    res.send({ publicKey: process.env.STRIPE_PUBLIC_KEY });
});


// Route de login/deconnexion
app.get('/login', function(req, res) {
    if (req.session.username) {
        req.session.username = null;
    }
    res.render('login', {
        year: date,
        logine: "Login/Register",
        notif: req.session.notif || " " 
    });
});

app.get('/pay', (req, res) => {
    // Logique de paiement avec Stripe ou PayPal
    // Une fois le paiement réussi, redirigez vers /signup
    res.redirect('/signup');
});


// Connexion
app.post('/connect', async (req, res) => {
    let user = await dbs.user.findOne({ where: { name: req.body.username }});
    if (user !== null) {
        const isMatch = await Bcrypt.compare(req.body.password, user.pswd);
        if (isMatch) {
            req.session.username = req.body.username;
            req.session.notif = "Bon retour, " + req.session.username + " !";
            res.redirect('/');
        } else {
            console.log("Nom d'utilisateur ou/et mot de passe érroné.");
            res.redirect("/login");
        }
    } else {
        console.log("Nom d'utilisateur ou/et mot de passe érroné.");
        res.redirect("/login");
    }
});


// Inscription
app.post('/newUser', async (req, res) => {
    const user = await dbs.user.findOne({ where: { name: req.body.username }});
    const email = await dbs.user_email.findOne({ where: { mail: req.body.email }});

    if (user === null) {
        if (email === null) {
            try {
                const hashedPassword = await Bcrypt.hash(req.body.password, 10);
                let newUser = await dbs.user.create({ 
                    name: req.body.username, 
                    pswd: hashedPassword, 
                    subscriptionType: 'paid'  // Inscription pour les utilisateurs payants uniquement
                });
                await dbs.user_email.create({ mail: req.body.email, user_name: newUser.name });
                req.session.username = req.body.username;
                req.session.notif = "Bienvenue sur notre site " + req.session.username + " !";
                res.redirect('/');
            } catch (error) {
                console.error('Error registering user:', error);
                res.status(500).send('Error registering user');
            }
        } else {
            req.session.notif = "L'e-mail que vous avez choisi: '" + req.body.mail + "' est déjà utilisée.";
            res.redirect("/login");
        }
    } else {
        req.session.notif = "Le nom d'utilisateur que vous avez choisi: '" + req.body.fname + "' est déjà pris, veuillez en choisir un nouveau.";
        res.redirect("/login");
    }
});

app.get('/signup', (req, res) => {
    res.render('signup', {
        year: date,
        logine: req.session.username || 'Se connecter / Choisir un plan',
        notif: req.session.notif || '',
        publicKey: process.env.STRIPE_PUBLIC_KEY // Passez la clé publique à la vue
    });
});

// Route pour le traitement du paiement et l'inscription
app.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword, stripeToken } = req.body;

    if (password !== confirmPassword) {
        req.session.notif = "Les mots de passe ne correspondent pas.";
        return res.redirect('/signup');
    }

   try {
        // Créer un client Stripe
 //       const charge = await stripe.charges.create({
 //           amount: 1000, // Montant en centimes (par exemple, 10 USD)
 //           currency: 'usd',
 //           description: 'Abonnement Premium',
 //           source: stripeToken,
 //       });

        const existingUser = await dbs.user.findOne({ where: { name: username } });
        const existingEmail = await dbs.user_email.findOne({ where: { mail: email } });

        if (existingUser || existingEmail) {
            req.session.notif = "Nom d'utilisateur ou e-mail déjà utilisé.";
            return res.redirect('/signup');
        }else{
            res.redirect("https://buy.stripe.com/dR6cNA4lu9Ko3Kg7ss");
            console.log('yeah')
        }
        

        const hashedPassword = await Bcrypt.hash(password, 10);
        const newUser = await dbs.user.create({ 
            name: username, 
            pswd: hashedPassword, 
            subscriptionType: 'paid',
            score: 0
        });
        await dbs.user_email.create({ mail: email, user_name: newUser.name });

        req.session.username = username;
        req.session.notif = "Bienvenue " + username + " ! Votre compte premium est activé.";
        res.redirect('/');
    } catch (error) {
        console.error('Error processing payment or registering user:', error);
        req.session.notif = "Erreur lors du paiement ou de l'inscription.";
        res.redirect('/signup');
    }
});

// Route pour afficher la page de téléchargement
app.get('/downloads', (req, res) => {
    // Liste des fichiers PDF (à adapter selon votre besoin)
    const pdfFiles = [
      { name: 'Fiche panneaux routiers', filename: 'fiche_panneaux_routiers.pdf' },
      { name: 'Livre panneaux routiers', filename: 'livre_panneaux_routiers.pdf' },
      { name: 'Livre panneaux routiers 2.pdf', filename: 'livre_panneaux_routiers2.pdf' },
      { name: 'Code de la route', filename: 'Code_de_la_Route.pdf' },
      { name: 'Comment demarrer une manuelle', filename: 'memento201103.pdf' },
      // Ajoutez d'autres fichiers ici
    ];
    res.render('downloads', { pdfFiles,
        year: date,
        logine : "Se connecter / Choisir un plan ?"
     });
  });

// Route pour démarrer le test
app.get('/test', (req, res) => {
    if (!req.session.questions) {
        req.session.questions = getRandomQuestions();
        req.session.corrections = [];
        
    }

    const questions = req.session.questions;
    const questionIndex = parseInt(req.query.questionIndex) || 0;
    const userAnswers = req.query.userAnswers ? JSON.parse(req.query.userAnswers) : [];
    let score = req.query.score ? parseInt(req.query.score) : 0;

    if (req.query.answer !== undefined) {
        const currentAnswer = parseInt(req.query.answer);
        const correctAnswer = questions[questionIndex - 1].correctAnswer;
        const penalty = questions[questionIndex - 1].penalty;

        if (currentAnswer !== correctAnswer) {
            score += penalty;
            req.session.corrections.push({
                question: questions[questionIndex - 1].question,
                selectedAnswer: questions[questionIndex - 1].options[currentAnswer],
                correctAnswer: questions[questionIndex - 1].options[correctAnswer],
                penalty
            });
        }
        userAnswers.push(currentAnswer);
    }

    if (questionIndex >= questions.length) {
        req.session.score = score;
        console.log(req.session.score)
        return res.redirect('/result');

        req.session.questions = null;
        req.session.corrections = null;
    }

    res.render('test', {
        logine: req.session.username || "Se connecter / Choisir un plan",
        year: date,
        question: questions[questionIndex],
        questionIndex,
        totalQuestions: questions.length,
        userAnswers: JSON.stringify(userAnswers),
        score
    });
});

app.get('/test-no-ads', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    const user = await dbs.user.findOne({ where: { name: req.session.username }});
    const timeLimit = user.timeLimit || 60;  // Utiliser une valeur par défaut de 60 minutes si non définie

    res.render('testnoads', {
        logine: req.session.username + " (Déconnexion)",
        year: date,
        question: questions[0],  // Exemple de question, remplacez par la logique réelle
        questionIndex: 0,
        totalQuestions: 5,  // Exemple, remplacez par la logique réelle
        userAnswers: [],
        score: 0,
        timeLimit: timeLimit  // Passer timeLimit à la vue
    });
});


app.post('/question', (req, res) => {
    const selectedAnswer = parseInt(req.body.answer);
    const questions = req.session.questions;
    const questionIndex = req.body.questionIndex;
    const correctAnswer = questions[questionIndex].correctAnswer;
    const penalty = questions[questionIndex].penalty;

    let userAnswers = req.body.userAnswers ? JSON.parse(req.body.userAnswers) : [];
    let score = req.body.score ? parseInt(req.body.score) : 0;

    userAnswers.push({
        question: questions[questionIndex].question,
        selectedAnswer: selectedAnswer,
        correctAnswer: correctAnswer,
        isCorrect: selectedAnswer === correctAnswer,
        penalty: penalty
    });

    if (selectedAnswer !== correctAnswer) {
        score -= penalty;
        req.session.corrections.push({
            question: questions[questionIndex].question,
            selectedAnswer: selectedAnswer,
            correctAnswer: correctAnswer,
            penalty: penalty
        });
    }

    const nextQuestionIndex = parseInt(questionIndex) + 1;
    if (nextQuestionIndex  >= questions.length) {
        res.redirect('/result');
    } else {
        res.redirect(`/test?questionIndex=${nextQuestionIndex}&userAnswers=${JSON.stringify(userAnswers)}&score=${score}`);
    }
});

app.get('/result', async (req, res) => {
    const user = await dbs.user.findOne({ where: { name: req.session.username }});
    const corrections = req.session.corrections || [];
    const score = req.session.score;

    try {
        if (req.session.username === null) {
            console.log("mawa 1");
        } else {
            console.log("ehla");
            await dbs.scores.create({
                user_name: req.session.username,
                result: Number(score),
                date: new Date().toLocaleDateString('fr-FR')
            });
            console.log("EHLA");
        }
    } catch (error) {
        console.error("Erreur lors de l'insertion du score :", error);  // Afficher l'erreur
        console.log("mawa 2");
    }

    res.render('result', { 
        score: score, 
        corrections: corrections,
        totalQuestions: req.session.questions.length,
        logine: req.session.username + " (Déconnexion)",
        year: date
    });

    req.session.corrections = [];
    req.session.questions = null;
});


app.get('/dashboard', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    const user = await dbs.user.findOne({ where: { name: req.session.username }});
    const scores = await dbs.scores.findAll({ where: { user_name: req.session.username }});

    if (user.subscriptionType !== 'paid') {
        return res.redirect('/');
    }

    res.render('dashboard', {
        username: user.name,
        scores: scores,
        timeLimit: user.timeLimit || 60,
        year: date,
        logine: req.session.username + " (Déconnexion)"
    });
});


// Création du serveur HTTPS
https.createServer({
    key: fs.readFileSync('static/key/key.pem'),
    cert: fs.readFileSync('static/key/cert.pem'),
    passphrase: 'ingi'
}, app).listen(8080);

console.log('Go to https://localhost:8080');
