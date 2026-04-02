// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCw1WGGRKMg7Aif1h7al0z4kp-5NngPWO4",
    authDomain: "compscient-website.firebaseapp.com",
    projectId: "compscient-website",
    storageBucket: "compscient-website.firebasestorage.app",
    messagingSenderId: "960362132192",
    appId: "1:960362132192:web:3d9c3ef61a9de90781d685",
    measurementId: "G-84613ZBVPM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
