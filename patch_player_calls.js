const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

const passTarget = `    initiatePass(targetPlayer) { 
        this.passTarget = targetPlayer;`;
const passReplace = `    initiatePass(targetPlayer) {
        if (targetPlayer && this.model.position.distanceTo(targetPlayer.model.position) > 20) {
            this.showActionBanner('L.PASS');
        } else {
            this.showActionBanner('PASS');
        }
        this.passTarget = targetPlayer;`;
code = code.replace(passTarget, passReplace);

const shootTarget = `    initiateShoot() {
        if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;`;
const shootReplace = `    initiateShoot() {
        this.showActionBanner('SHOT');
        if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;`;
code = code.replace(shootTarget, shootReplace);

const headerTarget = `    executeHeader() {
        // De frente para a bola`;
const headerReplace = `    executeHeader() {
        this.showActionBanner('HEADER');
        // De frente para a bola`;
code = code.replace(headerTarget, headerReplace);

const puntTarget = `     puntBall() {
        const vel = 30;`;
const puntReplace = `     puntBall() {
        this.showActionBanner('PUNT');
        const vel = 30;`;
code = code.replace(puntTarget, puntReplace);

const releaseTarget = `    executeRelease(targetPlayer) {
        let throwPos = targetPlayer.model.position.clone();`;
const releaseReplace = `    executeRelease(targetPlayer) {
        this.showActionBanner('THROW');
        let throwPos = targetPlayer.model.position.clone();`;
code = code.replace(releaseTarget, releaseReplace);

const groundKickTarget = `    kickFromGround() {
        const vel = 25;`;
const groundKickReplace = `    kickFromGround() {
        this.showActionBanner('PASS');
        const vel = 25;`;
code = code.replace(groundKickTarget, groundKickReplace);


fs.writeFileSync('js/player.js', code);
console.log("Patched player.js calls");
