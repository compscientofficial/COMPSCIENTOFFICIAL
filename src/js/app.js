import { 
    auth, 
    db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendEmailVerification, 
    onAuthStateChanged, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    updateDoc,
    validateEmail,
    validatePassword,
    showAuthMsg
} from './auth.js';

// --- API Mock / Firebase Data Helpers ---
async function apiFetch(endpoint, method = "GET", data = null) {
    if (!db) return [];
    const user = auth.currentUser;

    if (endpoint === "/user/profile") {
        if (!user) throw new Error("Unauthorized");
        const userRef = doc(db, "users", user.uid);
        if (method === "GET") {
            const snap = await getDoc(userRef);
            if (!snap.exists()) throw new Error("Profile not found");
            return snap.data();
        } else if (method === "POST") {
            await setDoc(userRef, { ...data, uid: user.uid }, { merge: true });
            return { message: "Profile updated" };
        }
    }

    if (endpoint === "/admin/login-history") {
        if (method === "POST") {
            if (user) {
                await addDoc(collection(db, "login_history"), { uid: user.uid, timestamp: Date.now() });
            }
            return {};
        }
        if (method === "GET") {
            const snap = await getDocs(collection(db, "login_history"));
            return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp);
        }
    }

    if (endpoint === "/auth/log-error" && method === "POST") {
        await addDoc(collection(db, "login_errors"), { ...data, timestamp: Date.now() });
        return {};
    }

    if (endpoint === "/admin/errors") {
        if (method === "GET") {
            const snap = await getDocs(collection(db, "login_errors"));
            return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp);
        }
        if (method === "DELETE") {
            const snap = await getDocs(collection(db, "login_errors"));
            for (let d of snap.docs) await deleteDoc(doc(db, "login_errors", d.id));
            return {};
        }
    }

    if ((endpoint.startsWith("/content/") || endpoint.startsWith("/admin/cms/")) && !endpoint.includes("courses")) {
        const type = endpoint.includes("live") ? "live" : "home";
        const contentRef = doc(db, "content", type);
        if (method === "GET") {
            const snap = await getDoc(contentRef);
            return snap.exists() ? snap.data() : {};
        } else if (method === "PUT") {
            await setDoc(contentRef, data, { merge: true });
            return { message: "Updated" };
        }
    }

    if (endpoint.includes("/courses")) {
        if (method === "GET") {
            const snap = await getDocs(collection(db, "courses"));
            return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        if (method === "POST") {
            await setDoc(doc(db, "courses", data.id), data);
            return {};
        } else if (method === "PUT") {
            const id = endpoint.split("/").pop();
            await updateDoc(doc(db, "courses", id), data);
            return {};
        } else if (method === "DELETE") {
            const id = endpoint.split("/").pop();
            await deleteDoc(doc(db, "courses", id));
            return {};
        }
    }

    if (endpoint.includes("/users")) {
        if (method === "GET") {
            const snap = await getDocs(collection(db, "users"));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        if (method === "POST") {
            await setDoc(doc(db, "users", data.uid), data);
            return {};
        }
        if (method === "PUT") {
            const id = endpoint.split("/").pop();
            await updateDoc(doc(db, "users", id), data);
            return {};
        } else if (method === "DELETE") {
            const id = endpoint.split("/").pop();
            await deleteDoc(doc(db, "users", id));
            return {};
        }
    }

    if (endpoint === "/registrations" && method === "POST") {
        await addDoc(collection(db, "users_courses_pending"), { ...data, timestamp: Date.now() });
        return { message: "Registered successfully" };
    }

    console.warn("Unmocked endpoint:", endpoint, method);
    return [];
}

// --- App Controller ---
document.addEventListener("DOMContentLoaded", () => {
    window.appController = {
        switchView: async (viewId) => {
            const user = auth.currentUser;
            
            // Route Guards
            if ((viewId === "view-course-detail") && !user) {
                console.warn("Blocked: Authentication required.");
                const loginModal = document.getElementById("loginModal");
                if (loginModal) {
                    loginModal.showModal();
                    loginModal.classList.add("show");
                }
                window.appController.switchView("view-landing");
                return;
            }

            // Perform Switch
            document.querySelectorAll(".view-section").forEach(s => s.classList.remove("active"));
            const target = document.getElementById(viewId);
            if (target) {
                target.classList.add("active");
                window.scrollTo(0, 0);
            }
        }
    };

    // --- UI Logic: Navbar & Scroll ---
    const mobileToggle = document.querySelector(".mobile-toggle");
    const navContainer = document.querySelector(".nav-container");
    if (mobileToggle) {
        mobileToggle.addEventListener("click", () => {
            navContainer.classList.toggle("active");
            const bars = document.querySelectorAll(".bar");
            if (navContainer.classList.contains("active")) {
                bars[0].style.transform = "translateY(8px) rotate(45deg)";
                bars[1].style.opacity = "0";
                bars[2].style.transform = "translateY(-8px) rotate(-45deg)";
            } else {
                bars[0].style.transform = "none";
                bars[1].style.opacity = "1";
                bars[2].style.transform = "none";
            }
        });
    }

    const navbar = document.querySelector(".navbar");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) {
            navbar.style.background = "rgba(13, 17, 23, 0.95)";
            navbar.style.boxShadow = "0 4px 30px rgba(0, 0, 0, 0.5)";
        } else {
            navbar.style.background = "rgba(13, 17, 23, 0.8)";
            navbar.style.boxShadow = "none";
        }
    });

    // --- Modal Logic ---
    const signupModal = document.getElementById("signupModal");
    const loginModal = document.getElementById("loginModal");
    const signupBtn = document.getElementById("signupBtn");
    const loginBtn = document.getElementById("loginBtn");

    const closeModal = (modal) => {
        modal.classList.remove("show");
        setTimeout(() => modal.close(), 300);
    };

    if (signupBtn && loginBtn) {
        signupBtn.addEventListener("click", () => {
            signupModal.showModal();
            signupModal.classList.add("show");
        });
        loginBtn.addEventListener("click", () => {
            loginModal.showModal();
            loginModal.classList.add("show");
        });
        document.getElementById("closeSignup").addEventListener("click", () => closeModal(signupModal));
        document.getElementById("closeLogin").addEventListener("click", () => closeModal(loginModal));
        
        window.addEventListener("click", (e) => {
            if (e.target === signupModal) closeModal(signupModal);
            if (e.target === loginModal) closeModal(loginModal);
        });
    }

    // --- Auth Forms Logic ---
    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const formData = {
                firstName: document.getElementById("firstName").value,
                lastName: document.getElementById("lastName").value,
                language: document.getElementById("language").value,
                itLevel: document.getElementById("itLevel").value,
                referer: document.getElementById("referer").value,
                region: document.getElementById("region").value,
                state: document.getElementById("state").value,
                district: document.getElementById("district").value,
                town: document.getElementById("town").value,
                email: document.getElementById("email").value.trim(),
                password: document.getElementById("password").value
            };

            if (!validateEmail(formData.email)) {
                showAuthMsg("signupAuthMsg", "Please enter a valid email address.", "error");
                return;
            }
            if (!validatePassword(formData.password)) {
                showAuthMsg("signupAuthMsg", "Password must be at least 8 characters, include an uppercase letter, a number, and a special character.", "error");
                return;
            }

            const btn = document.getElementById("btnFinishSignup");
            const content = signupForm.closest(".modal-content");
            const loader = signupForm.closest("dialog").querySelector(".modal-loader");
            const successView = document.getElementById("signupSuccess");

            try {
                btn.disabled = true;
                btn.innerText = "Processing...";
                loader.classList.add("active");

                const result = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                const user = result.user;
                const isAdmin = formData.email === "compscientofficial@gmail.com";
                const role = isAdmin ? "admin" : "student";

                const profile = {
                    uid: user.uid,
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    name: `${formData.firstName} ${formData.lastName}`,
                    email: formData.email,
                    role: role,
                    language: formData.language,
                    itLevel: formData.itLevel,
                    referer: formData.referer,
                    location: {
                        region: formData.region,
                        state: formData.state,
                        district: formData.district,
                        town: formData.town
                    },
                    createdAt: new Date().toISOString()
                };

                await apiFetch("/user/profile", "POST", profile);

                // EmailJS Diagnostic Function for Signup
                const sendSignupEmail = async () => {
                    if (typeof emailjs !== 'undefined') {
                        const templateParams = {
                            to_name: `${formData.firstName} ${formData.lastName}`,
                            user_email: formData.email,
                            reply_to: 'compscientofficial@gmail.com', // Updated to official
                            it_level: formData.itLevel,
                            language: formData.language,
                            location: `${formData.town}, ${formData.district}, ${formData.state}, ${formData.region}`
                        };
                        // DIAGNOSTIC LOG
                        console.log("Attempting to send Signup Email to:", formData.email);
                        
                        try {
                            const res = await emailjs.send('service_3u4sm6a', 'template_5vso8tz', templateParams);
                            console.log("Signup Email Success Details:", { recipient: formData.email, status: res.status, text: res.text });
                        } catch (err) {
                            console.error("Signup Email Error:", err);
                            alert(`FAILED to send to ${formData.email}. Error: ` + (err.text || err.message || "Unknown Error"));
                        }
                    }
                };

                // Trigger email independently
                sendSignupEmail();

                if (!isAdmin) {
                    await sendEmailVerification(user);
                }

                // Show success view
                loader.classList.remove("active");
                signupForm.classList.add("hidden");
                if (successView) {
                    successView.classList.remove("hidden");
                } else {
                    showAuthMsg("signupAuthMsg", "Account created! Please verify your email.", "success");
                    setTimeout(() => closeModal(signupModal), 3000);
                }

            } catch (err) {
                console.error("Signup Error:", err.code, err.message);
                try {
                    await apiFetch("/auth/log-error", "POST", { 
                        attemptedEmail: formData.email, 
                        errorMessage: err.message, 
                        code: err.code,
                        context: "signup"
                    });
                } catch (logErr) { console.error("Logging failed", logErr); }

                let msg = "Registration failed. Please try again.";
                if (err.code === "auth/email-already-in-use") {
                    msg = "This email is already registered. Please log in instead.";
                } else if (err.code === "auth/invalid-email") {
                    msg = "Invalid email format.";
                } else if (err.code === "auth/weak-password") {
                    msg = "Password is too weak.";
                } else if (err.code === "auth/too-many-requests") {
                    msg = "Too many attempts. Try again later.";
                } else if (err.code === "auth/network-request-failed") {
                    msg = "Network error. Please check your connection.";
                }

                showAuthMsg("signupAuthMsg", msg, "error");
                btn.disabled = false;
                btn.innerText = "Finish";
                loader.classList.remove("active");
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            const btn = loginForm.querySelector('button[type="submit"]');

            try {
                btn.disabled = true;
                btn.innerText = "Logging in...";
                const result = await signInWithEmailAndPassword(auth, email, password);
                const user = result.user;

                if (!user.emailVerified && user.email !== "compscientofficial@gmail.com") {
                    await signOut(auth);
                    showAuthMsg("loginAuthMsg", "Please verify your email first.", "error");
                    return;
                }

                if (user.email === "compscientofficial@gmail.com") {
                    await apiFetch("/admin/login-history", "POST", {});
                }
            } catch (err) {
                console.error("Auth Error:", err.code, err.message);
                try {
                    await apiFetch("/auth/log-error", "POST", { attemptedEmail: email, errorMessage: err.message, code: err.code, context: "login" });
                } catch (logErr) { console.error("Logging failed", logErr); }

                let msg = "Invalid credentials.";
                if (err.code === "auth/invalid-email") msg = "Invalid email format.";
                else if (err.code === "auth/too-many-requests") msg = "Too many attempts. Try later.";
                else if (["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].includes(err.code)) msg = "Incorrect email or password.";
                else if (err.code === "auth/network-request-failed") msg = "Network error.";

                showAuthMsg("loginAuthMsg", msg, "error");
            } finally {
                btn.disabled = false;
                btn.innerText = "Log In";
            }
        });
    }

    // --- Google Auth ---
    const handleGoogleAuth = async (isSignup = false) => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // If signup, try to capture Step 1 data
            let profileData = { name: user.displayName, email: user.email, role: "student" };
            
            if (isSignup) {
                const firstName = document.getElementById("firstName")?.value;
                const lastName = document.getElementById("lastName")?.value;
                if (firstName && lastName) {
                    profileData.firstName = firstName;
                    profileData.lastName = lastName;
                    profileData.name = `${firstName} ${lastName}`;
                    profileData.language = document.getElementById("language")?.value;
                    profileData.itLevel = document.getElementById("itLevel")?.value;
                    profileData.referer = document.getElementById("referer")?.value;
                    profileData.location = {
                        region: document.getElementById("region")?.value,
                        state: document.getElementById("state")?.value,
                        district: document.getElementById("district")?.value,
                        town: document.getElementById("town")?.value
                    };
                }
            }

            try {
                await apiFetch("/user/profile", "POST", profileData);
            } catch (err) {
                console.warn("Profile update failed or already exists", err);
            }

            // Close modals
            const signupModal = document.getElementById("signupModal");
            const loginModal = document.getElementById("loginModal");
            if (signupModal?.classList.contains("show")) {
                signupModal.classList.remove("show");
                setTimeout(() => signupModal.close(), 300);
            }
            if (loginModal?.classList.contains("show")) {
                loginModal.classList.remove("show");
                setTimeout(() => loginModal.close(), 300);
            }

        } catch (err) { console.error("Google Auth Error:", err); }
    };

    if (document.getElementById("btnLoginGoogle")) {
        document.getElementById("btnLoginGoogle").addEventListener("click", (e) => {
            e.preventDefault();
            handleGoogleAuth(false);
        });
    }
    if (document.getElementById("btnGoogleSignup")) {
        document.getElementById("btnGoogleSignup").addEventListener("click", (e) => {
            e.preventDefault();
            handleGoogleAuth(true);
        });
    }

    // --- Modal Management ---
    window.resetCourseRegisterModal = function() {
        const modal = document.getElementById('courseRegisterModal');
        const form = document.getElementById('courseRegisterForm');
        const btn = document.getElementById('btnSubmitCourseRegister');
        const loader = document.getElementById('courseRegisterLoader');
        const success = document.getElementById('registerSuccessMsg');
        const content = modal?.querySelector('.modal-content');

        if (form) {
            form.reset();
            form.classList.remove('hidden');
        }
        if (success) success.classList.add('hidden');
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Register";
            btn.style.display = 'block';
        }
        if (loader) loader.style.display = 'none';
        if (content) content.classList.remove('processing');
    };

    window.openCourseRegistration = function() {
        if (!auth.currentUser) {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.showModal();
                loginModal.classList.add('show');
            }
            return;
        }
        
        window.resetCourseRegisterModal();
        const regModal = document.getElementById('courseRegisterModal');
        if (regModal) {
            regModal.showModal();
            regModal.classList.add('show');
        }
    };

    // --- Course Registration ---
    const regForm = document.getElementById('courseRegisterForm');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = document.getElementById('btnSubmitCourseRegister');
            const loader = document.getElementById('courseRegisterLoader');
            const successMsg = document.getElementById('registerSuccessMsg');
            
            const modalContent = document.querySelector('#courseRegisterModal .modal-content');
            
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerText = "Processing...";
            }
            if (loader) loader.style.display = 'flex';
            if (modalContent) modalContent.classList.add('processing');
            
            const courseTitle = document.getElementById('cdTitle')?.innerText || 'Unknown Course';
            const formData = {
                firstName: document.getElementById('regFirstName').value,
                lastName: document.getElementById('regLastName').value,
                email: document.getElementById('regEmail').value,
                level: document.getElementById('regLevel').value,
                reason: document.getElementById('regReason').value,
                courseName: courseTitle,
                uid: auth.currentUser?.uid || null
            };
            
            try {
                // EmailJS Diagnostic Function for Registration
                const sendRegEmail = async () => {
                    if (typeof emailjs !== 'undefined') {
                        const templateParams = {
                            first_name: formData.firstName,
                            last_name: formData.lastName,
                            user_email: formData.email,
                            reply_to: 'compscientofficial@gmail.com', // Updated to official
                            course_level: formData.level,
                            reason: formData.reason,
                            course_name: formData.courseName
                        };
                        // DIAGNOSTIC LOG
                        console.log("Attempting to send Registration Email to:", formData.email);
                        
                        try {
                            const res = await emailjs.send('service_3u4sm6a', 'template_ttqws1h', templateParams);
                            console.log("Reg Email Success Details:", { recipient: formData.email, status: res.status, text: res.text });
                        } catch (err) {
                            console.error("Reg Email Error:", err);
                            alert(`FAILED to send to ${formData.email}. Error: ` + (err.text || err.message || "Unknown Error"));
                        }
                    }
                };

                // Trigger email independently
                sendRegEmail();
                
                await apiFetch("/registrations", "POST", formData);
                
                if (loader) loader.style.display = 'none';
                if (modalContent) modalContent.classList.remove('processing');
                regForm.classList.add('hidden');
                if (successMsg) successMsg.classList.remove('hidden');
            } catch (err) {
                console.error('Registration error:', err);
                if (loader) loader.style.display = 'none';
                if (modalContent) modalContent.classList.remove('processing');
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerText = "Register";
                }
                alert("Registration failed. Please try again.");
            }
        });
    }

    const closeRegBtn = document.getElementById('closeCourseRegister');
    if (closeRegBtn && regForm) {
        closeRegBtn.addEventListener('click', () => {
            setTimeout(() => {
                regForm.reset();
                regForm.classList.remove('hidden');
                const successMsg = document.getElementById('registerSuccessMsg');
                if (successMsg) successMsg.classList.add('hidden');
                const btnSubmit = document.getElementById('btnSubmitCourseRegister');
                if (btnSubmit) btnSubmit.disabled = false;
            }, 300);
        });
    }

    // --- Signup Multi-Step Logic ---
    const btnNextStep = document.getElementById("btnNextStep");
    const btnPrevStep = document.getElementById("btnPrevStep");
    const signupStep1 = document.getElementById("signupStep1");
    const signupStep2 = document.getElementById("signupStep2");

    if (btnNextStep && signupStep1 && signupStep2) {
        btnNextStep.addEventListener("click", () => {
            // Validation for Step 1
            const step1Inputs = signupStep1.querySelectorAll("input[required], select[required]");
            let valid = true;
            let firstInvalid = null;

            step1Inputs.forEach(input => {
                if (!input.value.trim()) {
                    input.style.borderColor = "var(--error-color)";
                    valid = false;
                    if (!firstInvalid) firstInvalid = input;
                } else {
                    input.style.borderColor = "var(--border-color)";
                }
            });

            if (valid) {
                signupStep1.classList.add("hidden");
                signupStep2.classList.remove("hidden");
            } else if (firstInvalid) {
                firstInvalid.focus();
            }
        });
    }

    if (btnPrevStep && signupStep1 && signupStep2) {
        btnPrevStep.addEventListener("click", () => {
            signupStep2.classList.add("hidden");
            signupStep1.classList.remove("hidden");
        });
    }

    // --- Global Auth State listener ---
    onAuthStateChanged(auth, async (user) => {
        const unauthNav = document.getElementById("unauthNav");
        const authNav = document.getElementById("authNav");
        const nameDisplay = document.getElementById("userNameDisplay");

        if (user) {
            if (unauthNav) unauthNav.classList.add("hidden");
            if (authNav) authNav.classList.remove("hidden");
            if (nameDisplay) nameDisplay.textContent = `Hello, ${user.displayName || user.email.split("@")[0]}`;
            
            document.querySelectorAll(".lock-icon").forEach(icon => icon.style.display = "none");
            document.querySelectorAll("#lab, #courses").forEach(sec => sec.classList.remove("section-locked"));
            document.querySelectorAll(".course-card").forEach(card => card.classList.remove("locked"));

            try {
                const isAdmin = user.email === "compscientofficial@gmail.com";
                let profile;
                try {
                    profile = await apiFetch("/user/profile");
                } catch {
                    profile = { uid: user.uid, name: user.displayName || user.email.split("@")[0], email: user.email, role: isAdmin ? "admin" : "student", class: "General" };
                    await apiFetch("/user/profile", "POST", { name: profile.name, email: profile.email, role: profile.role, userClass: profile.class });
                }

                if (loginModal?.classList.contains("show")) closeModal(loginModal);
                if (signupModal?.classList.contains("show")) closeModal(signupModal);

                if (loginModal?.classList.contains("show")) closeModal(loginModal);
                if (signupModal?.classList.contains("show")) closeModal(signupModal);
            } catch (err) { console.error("Persistence Error:", err); }

        } else {
            if (authNav) authNav.classList.add("hidden");
            if (unauthNav) unauthNav.classList.remove("hidden");
            document.querySelectorAll(".lock-icon").forEach(icon => icon.style.display = "inline");
            document.querySelectorAll("#lab, #courses").forEach(sec => sec.classList.add("section-locked"));
            document.querySelectorAll(".course-card").forEach(card => card.classList.add("locked"));
            window.appController.switchView("view-landing");
        }
    });

    // --- Logout ---
    document.addEventListener("click", async (e) => {
        if (e.target.id === "logoutBtn" || e.target.id === "adminLogoutBtn" || e.target.closest("#logoutBtn") || e.target.closest("#adminLogoutBtn")) {
            e.preventDefault();
            try {
                await signOut(auth);
                window.location.reload();
            } catch (err) { console.error("Logout failed:", err); }
        }

        const authReq = e.target.closest(".auth-required");
        if (authReq) {
            if (!auth.currentUser) {
                e.preventDefault();
                e.stopPropagation();
                loginModal.showModal();
                loginModal.classList.add("show");
            } else {
                e.preventDefault();
                const target = authReq.getAttribute("data-target");
                if (target) document.getElementById(target)?.scrollIntoView();
            }
        }
    });

    // --- Lab Logic ---
    const labTabs = document.querySelectorAll(".lab-tab");
    const editors = {
        html: document.getElementById("htmlEditor"),
        css: document.getElementById("cssEditor"),
        js: document.getElementById("jsEditor"),
        java: document.getElementById("javaEditor")
    };
    let currentLang = "html";
    if (labTabs.length > 0) {
        labTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                labTabs.forEach(t => t.classList.remove("active"));
                Object.values(editors).forEach(ed => ed.classList.remove("active"));
                tab.classList.add("active");
                currentLang = tab.getAttribute("data-lang");
                editors[currentLang].classList.add("active");
            });
        });

        const runBtn = document.getElementById("runBtn");
        const labOutput = document.getElementById("labOutput");
        runBtn.addEventListener("click", () => {
            const html = editors.html.value;
            const css = `<style>${editors.css.value}</style>`;
            const js = `<script>${editors.js.value}<\/script>`;
            const javaCode = editors.java.value;
            let javaSim = "";
            if (javaCode.trim() !== "") {
                javaSim = '<script>console.log("Java execution blocked on frontend. Role required: Verified Student.")<\/script>';
            }
            labOutput.srcdoc = `<!DOCTYPE html><html><head>${css}</head><body>${html}${javaSim}${js}</body></html>`;
        });

        document.getElementById("saveBtn").addEventListener("click", () => {
            const content = editors[currentLang].value;
            if (!content) return alert("Editor is empty!");
            const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const ext = currentLang === "js" ? "js" : currentLang === "html" ? "html" : currentLang === "css" ? "css" : "java";
            a.href = url;
            a.download = `compscient_lab.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        });

        const importFile = document.getElementById("importFile");
        document.getElementById("importBtn").addEventListener("click", () => importFile.click());
        importFile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { editors[currentLang].value = ev.target.result; };
            reader.readAsText(file);
            importFile.value = "";
        });
    }

    // --- CMS & Hydration ---
    async function hydrateCMS() {
        const defaultCourses = [
            { id: "static-ai-ml-engineers", icon: "🤖", title: "AI/ML Engineers", description: "Master artificial intelligence and machine learning to build intelligent systems.", steps: `<h3>Introduction to AI/ML</h3><p>Artificial Intelligence (AI) and Machine Learning (ML) are the frontiers of modern technology, enabling systems to learn from data and make intelligent decisions.</p><h3>What is AI/ML?</h3><p>AI is the simulation of human intelligence by machines, while ML is a subset focused on algorithms that improve through experience.</p><h3>Where is it used?</h3><p>From recommendation engines like Netflix to autonomous vehicles and medical diagnostics, AI/ML is revolutionizing every industry.</p>` },
            { id: "static-cloud-architects", icon: "☁️", title: "Cloud Architects", description: "Design and deploy scalable, secure, and highly available cloud infrastructure.", steps: `<h3>Introduction to Cloud Architecture</h3><p>Cloud architecture is the design of software applications and systems on cloud infrastructure.</p><h3>What is Cloud Architecture?</h3><p>It involves leveraging services like AWS, Azure, or GCP to build scalable and resilient systems.</p><h3>Where is it used?</h3><p>Used by companies like Airbnb and Spotify to manage massive global traffic and data without physical servers.</p>` },
            { id: "static-cybersecurity-analysts", icon: "🛡️", title: "Cybersecurity Analysts", description: "Protect networks and systems by monitoring, detecting, and responding to threats.", steps: `<h3>Introduction to Cybersecurity</h3><p>Cybersecurity is the practice of protecting systems, networks, and programs from digital attacks.</p><h3>What is Cybersecurity?</h3><p>It involves technical controls, policies, and awareness to ensure confidentiality, integrity, and availability of data.</p><h3>Where is it used?</h3><p>Essential for banks, government agencies, and any organization handling sensitive user information.</p>` },
            { id: "static-data-scientists", icon: "📊", title: "Data Scientists", description: "Analyze complex data sets to drive strategic business decisions and insights.", steps: `<h3>Introduction to Data Science</h3><p>Data Science combines math, statistics, and programming to extract meaningful insights from data.</p><h3>What is Data Science?</h3><p>It is the process of cleaning, analyzing, and modeling data to solve complex problems.</p><h3>Where is it used?</h3><p>Used in marketing to predict customer behavior, in finance for fraud detection, and in healthcare for drug discovery.</p>` },
            { id: "static-full-stack-developers", icon: "💻", title: "Full Stack Developers", description: "Build end-to-end web applications bridging frontend interfaces and backend systems.", steps: `<h3>Introduction to Full Stack Development</h3><p>Full stack development covers both the frontend (user interface) and the backend (server/database) of applications.</p><h3>What is a Full Stack Developer?</h3><p>A developer who can handle all layers of a web application project, from UI design to database management.</p><h3>Where is it used?</h3><p>In startups and tech companies to build complete web products efficiently from scratch.</p>` },
            { id: "static-html-css", icon: "🌐", title: "HTML & CSS", description: "Build the structural and visual foundation of modern, responsive websites.", steps: `<h3>Introduction to HTML & CSS</h3><p>HTML and CSS are the two most fundamental languages for building web pages.</p><h3>What are HTML & CSS?</h3><p>HTML (HyperText Markup Language) provides the structure, while CSS (Cascading Style Sheets) provides the design and layout.</p><h3>Where are they used?</h3><p>Used in every single website on the internet. They are the essential starting point for all web developers.</p>` },
            { id: "static-js", icon: "⚡", title: "JavaScript (JS)", description: "Create dynamic, interactive user experiences and complex web applications.", steps: `<h3>Introduction to JavaScript</h3><p>JavaScript is a versatile programming language used to create interactive and dynamic content on web pages.</p><h3>What is JavaScript?</h3><p>It is a high-level, interpreted scripting language that makes web pages "come alive" with animations and logic.</p><h3>Where is it used?</h3><p>Used for frontend interactivity, backend development (Node.js), and even mobile/desktop app development.</p>` },
            { id: "static-java", icon: "☕", title: "Java", description: "Master robust, object-oriented programming for enterprise and mobile solutions.", steps: `<h3>Introduction to Java</h3><p>Java is a high-level, class-based, object-oriented programming language designed for portability.</p><h3>What is Java?</h3><p>It is a versatile language that follows the "Write Once, Run Anywhere" principle.</p><h3>Where is it used?</h3><p>Widely used for enterprise-level applications, Android apps, and server-side backend systems.</p>` },
            { id: "static-python", icon: "🐍", title: "Python", description: "Learn artificial intelligence, data science, and backend development.", steps: `<h3>Introduction to Python</h3><p>Python is a popular, general-purpose computer programming language known for its readability.</p><h3>What is Python?</h3><p>A language with a simple syntax that makes it easy for beginners and powerful for experts.</p><h3>Where is it used?</h3><p>Used heavily in AI, Data Science, Automation, and Backend Web Development (Django/Flask).</p>` },
            { id: "static-cpp", icon: "⚙️", title: "C++", description: "Build high-performance applications, game engines, and system software.", steps: `<h3>Introduction to C++</h3><p>C++ is a high-performance programming language used for system/application software and game development.</p><h3>What is C++?</h3><p>An extension of the C language that adds object-oriented features and direct hardware manipulation.</p><h3>Where is it used?</h3><p>Used in game engines (Unreal Engine), operating systems, and high-frequency trading platforms.</p>` },
            { id: "static-csharp", icon: "🎯", title: "C#", description: "Develop Windows applications, enterprise software, and Unity games.", steps: `<h3>Introduction to C#</h3><p>C# (C-Sharp) is a modern, object-oriented language developed by Microsoft.</p><h3>What is C#?</h3><p>A versatile language that runs on the .NET framework, designed for building secure and robust applications.</p><h3>Where is it used?</h3><p>Commonly used for Windows desktop apps, enterprise software, and game development with Unity.</p>` },
            { id: "static-php", icon: "🐘", title: "PHP", description: "Script server-side web applications and master content management systems.", steps: `<h3>Introduction to PHP</h3><p>PHP is a widely-used open-source general-purpose scripting language that is especially suited for web development.</p><h3>What is PHP?</h3><p>A server-side language that can be embedded into HTML to create dynamic web pages.</p><h3>Where is it used?</h3><p>Powers millions of websites, including WordPress, and is used for backend server-side logic.</p>` },
            { id: "static-ruby", icon: "💎", title: "Ruby", description: "Rapidly build web applications with an elegant and readable syntax.", steps: `<h3>Introduction to Ruby</h3><p>Ruby is a dynamic, open-source programming language with a focus on simplicity and productivity.</p><h3>What is Ruby?</h3><p>An elegant language that feels natural to read and easy to write, heavily used with the Ruby on Rails framework.</p><h3>Where is it used?</h3><p>Popular for rapid web application development and building scalable web startups.</p>` },
            { id: "static-swift", icon: "🍎", title: "Swift", description: "Create fluid, native and fast applications for the Apple ecosystem.", steps: `<h3>Introduction to Swift</h3><p>Swift is a powerful and intuitive programming language for iOS, iPadOS, macOS, tvOS, and watchOS.</p><h3>What is Swift?</h3><p>A fast, safe, and modern language replacement for Objective-C in the Apple ecosystem.</p><h3>Where is it used?</h3><p>Used exclusively for building native applications for iPhones, iPads, and Mac computers.</p>` },
            { id: "static-go", icon: "🐹", title: "Go", description: "Build incredibly fast, reliable, and scalable backend infrastructure.", steps: `<h3>Introduction to Go (Golang)</h3><p>Go is an open-source programming language developed by Google that makes it easy to build simple, reliable, and efficient software.</p><h3>What is Go?</h3><p>A compiled language focused on concurrency, speed, and simplicity in cloud and server-side software.</p><h3>Where is it used?</h3><p>Used for building cloud-native applications, microservices, and high-performance backend infrastructure.</p>` },
            { id: "static-software-engineer", icon: "🏗️", title: "Software Engineer", description: "Learn the principles of software engineering to design, build, and maintain large-scale systems.", steps: `<h3>Introduction to Software Engineering</h3><p>Software Engineering is the systematic application of engineering principles to the development of software.</p><h3>What is Software Engineering?</h3><p>It involves the entire lifecycle of software, including requirements gathering, design, coding, testing, and maintenance.</p><h3>Where is it used?</h3><p>Everywhere software is built professionally, from small apps to massive enterprise systems.</p>` },
            { id: "static-full-stack-development", icon: "💻", title: "Full Stack Development", description: "Master APIs, databases, and front-end frameworks to build end-to-end applications.", steps: `<h3>Introduction to Full Stack</h3><p>Mastering both the client and server sides of the web.</p><h3>What is it?</h3><p>Integrating databases (SQL/NoSQL) with frontend frameworks (React/Vue) and backend APIs.</p><h3>Where is it used?</h3><p>Essential for developers who want to manage the entire application stack independently.</p>` },
            { id: "static-cloud-computing-devops", icon: "☁️", title: "Cloud Computing & DevOps", description: "Learn to deploy, scale, and manage infrastructure with AWS, Docker, and CI/CD pipelines.", steps: `<h3>Introduction to DevOps</h3><p>DevOps is the combination of cultural philosophies, practices, and tools that increases an organization’s ability to deliver applications.</p><h3>What is Cloud & DevOps?</h3><p>Automating infrastructure and deployment using cloud platforms and containerization.</p><h3>Where is it used?</h3><p>In modern tech companies to achieve continuous integration and continuous deployment (CI/CD).</p>` },
            { id: "static-data-science-ai", icon: "🧠", title: "Data Science & AI", description: "Train machine learning models, analyze vast datasets, and leverage artificial intelligence.", steps: `<h3>Introduction to Data Science & AI</h3><p>The intersection of statistical analysis and automated learning machines.</p><h3>What is it?</h3><p>Using algorithms to model complex data patterns and predict future trends.</p><h3>Where is it used?</h3><p>Used in predictive analytics, natural language processing, and advanced digital assistants.</p>` },
            { id: "static-mobile-app-development", icon: "📱", title: "Mobile App Development", description: "Build native and cross-platform applications with modern technologies like React Native and Flutter.", steps: `<h3>Introduction to Mobile Dev</h3><p>Building applications specifically designed for mobile devices like smartphones and tablets.</p><h3>What is Mobile App Development?</h3><p>Using frameworks like Flutter or React Native to build apps that run on both iOS and Android.</p><h3>Where is it used?</h3><p>From social media apps to banking and gaming, mobile apps are the primary interface for most users today.</p>` },
            { id: "static-cybersecurity-hacking", icon: "🛡️", title: "Cybersecurity & Hacking", description: "Learn to secure networks, find vulnerabilities, and protect enterprise digital assets.", steps: `<h3>Introduction to Security & Hacking</h3><p>Understanding the mindset of an attacker to build stronger defenses.</p><h3>What is Ethical Hacking?</h3><p>The practice of testing networks and systems for security vulnerabilities to protect them.</p><h3>Where is it used?</h3><p>In security auditing, penetration testing, and protecting corporate infrastructure from data breaches.</p>` },
            { id: "static-game-developer", icon: "🎮", title: "Game Developer", description: "Dive into graphics programming, physics engines, and advanced game logic architecture.", steps: `<h3>Introduction to Game Development</h3><p>Creating interactive experiences using computer graphics and physics simulations.</p><h3>What is Game Development?</h3><p>The process of designing, coding, and testing games using engines like Unity or Unreal Engine.</p><h3>Where is it used?</h3><p>Used to build everything from mobile indie games to AAA blockbuster titles on consoles.</p>` },
            { id: "static-rust", icon: "🦀", title: "Rust", description: "Build blazing fast, memory-safe systems and modern backend applications.", steps: `<h3>Introduction to Rust</h3><p>Rust is a multi-paradigm, general-purpose programming language designed for performance and safety.</p><h3>What is Rust?</h3><p>A language that guarantees memory safety without a garbage collector, making it ideal for system programming.</p><h3>Where is it used?</h3><p>Used for building OS kernels, web browsers, and high-performance backend services.</p>` },
            { id: "static-kotlin", icon: "🚀", title: "Kotlin", description: "Develop modern, expressive, and safe Android applications seamlessly.", steps: `<h3>Introduction to Kotlin</h3><p>Kotlin is a cross-platform, statically typed, general-purpose programming language.</p><h3>What is Kotlin?</h3><p>The modern standard for Android development, offering better safety and conciseness than Java.</p><h3>Where is it used?</h3><p>Primary language for Android app development and increasingly used for backend services.</p>` },
            { id: "static-typescript", icon: "📘", title: "TypeScript", description: "Supercharge your JavaScript with static typing and modern architectural patterns.", steps: `<h3>Introduction to TypeScript</h3><p>TypeScript is a strongly typed programming language that builds on JavaScript.</p><h3>What is TypeScript?</h3><p>A superset of JavaScript that adds elective static typing, making it easier to build large-scale applications.</p><h3>Where is it used?</h3><p>Used in almost all modern web applications to prevent runtime errors and improve developer productivity.</p>` },
            { id: "static-sql-databases", icon: "🗄️", title: "SQL & Databases", description: "Master relational databases, data modeling, and complex querying optimizations.", steps: `<h3>Introduction to SQL</h3><p>Structured Query Language (SQL) is the standard language for relational database management systems.</p><h3>What is SQL?</h3><p>A language used to communicate with databases for tasks such as updating or retrieving data.</p><h3>Where is it used?</h3><p>Universal in applications that require structured data storage, from simple blogs to complex financial systems.</p>` },
            { id: "static-nosql-mongodb", icon: "🍃", title: "NoSQL & MongoDB", description: "Build scalable, flexible database architectures for modern web applications.", steps: `<h3>Introduction to NoSQL</h3><p>NoSQL databases provide a mechanism for storage and retrieval of data that is modeled in means other than tabluar relations.</p><h3>What is MongoDB?</h3><p>A popular document-oriented NoSQL database that uses JSON-like documents with optional schemas.</p><h3>Where is it used?</h3><p>Great for real-time analytics, content management, and applications with rapidly changing data structures.</p>` },
            { id: "static-blockchain-web3", icon: "⛓️", title: "Blockchain & Web3", description: "Build decentralized applications, smart contracts, and Web3 solutions.", steps: `<h3>Introduction to Blockchain</h3><p>Blockchain is a decentralized, distributed ledger that records transactions across many computers.</p><h3>What is Web3?</h3><p>The next generation of the internet, focused on decentralization, blockchain technologies, and token-based economics.</p><h3>Where is it used?</h3><p>Used in cryptocurrencies, smart contracts, and Decentralized Finance (DeFi) platforms.</p>` },
            { id: "static-machine-learning", icon: "🤖", title: "Machine Learning", description: "Design algorithms that learn from data and predict smart future outcomes.", steps: `<h3>Introduction to ML</h3><p>Algorithms that can learn from and make predictions on data.</p><h3>What is Machine Learning?</h3><p>Automating model building for data analysis using statistical techniques.</p><h3>Where is it used?</h3><p>Used in recommendation systems, speech recognition, and fraudulent transaction detection.</p>` },
            { id: "static-deep-learning", icon: "🧬", title: "Deep Learning", description: "Dive into neural networks, natural language processing, and computer vision.", steps: `<h3>Introduction to Deep Learning</h3><p>A subfield of ML based on artificial neural networks with multiple layers.</p><h3>What is Deep Learning?</h3><p>The engine behind advanced AI like image recognition and natural language translation.</p><h3>Where is it used?</h3><p>Powers voice assistants, facial recognition, and self-driving cars.</p>` },
            { id: "static-penetration-testing", icon: "🥷", title: "Penetration Testing", description: "Master advanced ethical hacking to discover and exploit critical vulnerabilities.", steps: `<h3>Introduction to PenTesting</h3><p>Authorized simulated cyberattacks on computer systems to evaluate security.</p><h3>What is it?</h3><p>Finding "holes" in a system before malicious hackers do.</p><h3>Where is it used?</h3><p>Vital for corporate security assessments and compliance auditing.</p>` },
            { id: "static-ui-ux-design", icon: "🎨", title: "UI/UX Design", description: "Design intuitive, highly accessible, and stunning user interfaces and experiences.", steps: `<h3>Introduction to UI/UX</h3><p>The art and science of designing the visual and interactive aspects of a product.</p><h3>What is UI/UX?</h3><p>UI (User Interface) is about how it looks; UX (User Experience) is about how it feels.</p><h3>Where is it used?</h3><p>In every digital product, from mobile apps to complex software interfaces, to ensure user satisfaction.</p>` },
            { id: "static-docker-kubernetes", icon: "🐳", title: "Docker & Kubernetes", description: "Containerize and orchestrate massive scalable applications across clusters.", steps: `<h3>Introduction to Containers</h3><p>Containerization allows developers to bundle applications with all their dependencies.</p><h3>What is Kubernetes?</h3><p>An orchestration system for automating deployment, scaling, and management of containerized applications.</p><h3>Where is it used?</h3><p>Standard practice for deploying modern cloud-based microservices at scale.</p>` },
            { id: "static-linux-administration", icon: "🐧", title: "Linux Administration", description: "Master the command line, kernel architecture, and robust server management.", steps: `<h3>Introduction to Linux</h3><p>Linux is the leading operating system for servers, mainframe computers, and supercomputers.</p><h3>What is it?</h3><p>Managing the Linux OS through the terminal, shell scripting, and system configuration.</p><h3>Where is it used?</h3><p>Powers the vast majority of the internet's web servers and cloud infrastructure.</p>` },
            { id: "static-digital-forensics", icon: "🕵️", title: "Digital Forensics", description: "Analyze digital evidence, complex network traffic, and malicious malware behavior.", steps: `<h3>Introduction to Forensics</h3><p>The application of science to identify, collect, and analyze data from digital devices.</p><h3>What is Digital Forensics?</h3><p>Investigating cybercrimes by recovering and examining material found on digital devices.</p><h3>Where is it used?</h3><p>Used by law enforcement and corporate security teams to solve crimes and data breaches.</p>` },
            { id: "static-internet-of-things-iot", icon: "🔌", title: "Internet of Things (IoT)", description: "Connect smart devices, robust sensors, and microcontrollers to the modern web.", steps: `<h3>Introduction to IoT</h3><p>The network of physical objects embedded with sensors and software to exchange data.</p><h3>What is IoT?</h3><p>Connecting "dumb" devices to the internet to make them "smart".</p><h3>Where is it used?</h3><p>Smart homes, wearable health monitors, and industrial automation (IIoT).</p>` },
            { id: "static-augmented-reality-ar", icon: "👓", title: "Augmented Reality (AR)", description: "Build highly immersive AR experiences for both mobile and spatial web platforms.", steps: `<h3>Introduction to AR</h3><p>An interactive experience where real-world objects are enhanced by computer-generated information.</p><h3>What is AR?</h3><p>Overlaying digital content onto the physical world, typically through a camera view.</p><h3>Where is it used?</h3><p>Used in filters (Snapchat), gaming (Pokémon GO), and industrial training.</p>` },
            { id: "static-virtual-reality-vr", icon: "🥽", title: "Virtual Reality (VR)", description: "Develop fully immersive, 3D interactive and engaging virtual environments.", steps: `<h3>Introduction to VR</h3><p>A simulated experience that can be similar to or completely different from the real world.</p><h3>What is VR?</h3><p>Full immersion in a digital world using a headset.</p><h3>Where is it used?</h3><p>Gaming, virtual tours, surgical training, and social virtual spaces.</p>` },
            { id: "static-big-data-analytics", icon: "📊", title: "Big Data Analytics", description: "Process, safely analyze, and visualize massive datasets using modern data tools.", steps: `<h3>Introduction to Big Data</h3><p>Extremely large data sets that may be analyzed computationally to reveal patterns.</p><h3>What is Big Data?</h3><p>Working with the three V's: Volume, Velocity, and Variety.</p><h3>Where is it used?</h3><p>In market research, health informatics, and urban planning to find hidden patterns.</p>` },
            { id: "static-system-architecture", icon: "📐", title: "System Architecture", description: "Design scalable, highly fault-tolerant, and performant enterprise software systems.", steps: `<h3>Introduction to Architecture</h3><p>The conceptual model that defines the structure, behavior, and more views of a system.</p><h3>What is System Architecture?</h3><p>The high-level design of complex software systems to ensure performance and reliability.</p><h3>Where is it used?</h3><p>Essential for designing web platforms that handle millions of concurrent users.</p>` },
            { id: "static-agile-scrum", icon: "🏃", title: "Agile & Scrum", description: "Master standard modern project management and software delivery methodologies.", steps: `<h3>Introduction to Agile</h3><p>A methodology that promotes continuous iteration of development and testing throughout the lifecycle.</p><h3>What is Scrum?</h3><p>A specific framework within Agile for managing complex projects and software delivery.</p><h3>Where is it used?</h3><p>The de facto standard for project management in the tech industry.</p>` },
            { id: "static-react-next-js", icon: "⚛️", title: "React & Next.js", description: "Build dynamic, beautifully SEO-friendly, and blazing-fast web applications.", steps: `<h3>Introduction to React</h3><p>A JavaScript library for building user interfaces, maintained by Meta.</p><h3>What is Next.js?</h3><p>A framework for React that handles server-side rendering and static site generation.</p><h3>Where is it used?</h3><p>Used by companies like Netflix, Facebook, and TikTok to build their web interfaces.</p>` },
            { id: "static-node-js-backend", icon: "🟩", title: "Node.js Backend", description: "Build scalable, extremely event-driven backend services and reliable REST APIs.", steps: `<h3>Introduction to Node.js</h3><p>A JavaScript runtime built on Chrome's V8 engine for building server-side applications.</p><h3>What is it?</h3><p>Using JavaScript outside the browser to build fast, scalable network applications.</p><h3>Where is it used?</h3><p>Powers the backends of modern apps like LinkedIn, Uber, and PayPal.</p>` },
            { id: "static-aws-cloud-practitioner", icon: "☁️", title: "AWS Cloud Practitioner", description: "Master the core Amazon Web Services cloud ecosystem and infrastructure provisioning.", steps: `<h3>Introduction to AWS</h3><p>The world's most comprehensive and broadly adopted cloud platform.</p><h3>What is the practitioner level?</h3><p>Gaining a foundational understanding of AWS Cloud concepts, security, and technology.</p><h3>Where is it used?</h3><p>Essential for anyone working with AWS infrastructure in any capacity.</p>` },
            { id: "static-ethical-hacking-ceh", icon: "🔓", title: "Ethical Hacking (CEH)", description: "Learn professional security testing and deep vulnerability assessment methodologies.", steps: `<h3>Introduction to CEH</h3><p>The Certified Ethical Hacker (CEH) is a qualification obtained by demonstrating knowledge in security testing.</p><h3>What is it?</h3><p>Systematically attempting to penetrate a computer system to find security threats.</p><h3>Where is it used?</h3><p>Standard certification for security professionals and network defenders.</p>` },
            { id: "static-frontend-engineering", icon: "⚛️", title: "Frontend Engineering", description: "Master component-driven UI architecture, state management, and web performance optimization.", steps: `<h3>Introduction to Frontend</h3><p>The practice of producing HTML, CSS, and JavaScript for a website so a user can see and interact with them.</p><h3>What is Frontend Engineering?</h3><p>Building complex client-side applications with modern frameworks and optimization techniques.</p><h3>Where is it used?</h3><p>Developing the part of the website users directly interact with.</p>` },
            { id: "static-backend-architecture", icon: "⚙️", title: "Backend Architecture", description: "Design and deploy robust, high-availability server-side logic and microservices.", steps: `<h3>Introduction to Backend</h3><p>The "under the hood" part of a website that users don't see.</p><h3>What is Backend Architecture?</h3><p>Designing the servers, databases, and APIs that make the frontend work.</p><h3>Where is it used?</h3><p>Handling data processing, authentication, and communication in all web apps.</p>` },
            { id: "static-database-administration", icon: "🗄️", title: "Database Administration", description: "Learn performance tuning, security, and maintenance of critical enterprise databases.", steps: `<h3>Introduction to DBA</h3><p>The task of managing and maintaining database software.</p><h3>What is it?</h3><p>Ensuring data is stored securely, backed up, and accessible with high performance.</p><h3>Where is it used?</h3><p>Critical in any organization that stores large amounts of structured data.</p>` },
            { id: "static-mern-stack-masterclass", icon: "🍃", title: "MERN Stack Masterclass", description: "Build comprehensive web applications using MongoDB, Express.js, React, and Node.js.", steps: `<h3>Introduction to MERN</h3><p>A full-stack JavaScript framework used for easier and faster deployment of full-stack web applications.</p><h3>What is MERN?</h3><p>MongoDB, Express, React, and Node.js—all working together seamlessly.</p><h3>Where is it used?</h3><p>One of the most popular stacks for building modern, high-performance web applications.</p>` },
            { id: "static-mean-stack-development", icon: "🌐", title: "MEAN Stack Development", description: "Develop robust full-stack applications with MongoDB, Express, Angular, and Node.js.", steps: `<h3>Introduction to MEAN</h3><p>A free and open-source JavaScript software stack for building dynamic web sites and web applications.</p><h3>What is MEAN?</h3><p>MongoDB, Express, Angular, and Node.js—an alternative to MERN using Angular.</p><h3>Where is it used?</h3><p>Preferred for large-scale enterprise projects where structured frontend architecture is key.</p>` },
            { id: "static-django-web-framework", icon: "🛠️", title: "Django Web Framework", description: "Rapidly construct secure and maintainable database-driven websites using Python.", steps: `<h3>Introduction to Django</h3><p>A high-level Python web framework that encourages rapid development and clean, pragmatic design.</p><h3>What is it?</h3><p>A "batteries-included" framework that handles common web development tasks out of the box.</p><h3>Where is it used?</h3><p>Used by Instagram and Pinterest for their backend systems.</p>` },
            { id: "static-spring-boot-developer", icon: "☕", title: "Spring Boot Developer", description: "Create production-grade, stand-alone Spring applications for enterprise Java systems.", steps: `<h3>Introduction to Spring Boot</h3><p>An open-source Java-based framework used to create a micro-service.</p><h3>What is it?</h3><p>Simplifying the development of Java enterprise applications with convention over configuration.</p><h3>Where is it used?</h3><p>Used by thousands of companies globally for robust, scalable backend systems.</p>` },
            { id: "static-asp-net-core-systems", icon: "🎯", title: "ASP.NET Core Systems", description: "Build modern, cloud-based, and internet-connected applications using C# and .NET.", steps: `<h3>Introduction to ASP.NET</h3><p>A free, open-source web framework for building modern web apps and services.</p><h3>What is .NET Core?</h3><p>The cross-platform version of .NET for building applications for Linux, macOS, and Windows.</p><h3>Where is it used?</h3><p>Widely used for corporate and enterprise web application development.</p>` },
            { id: "static-ios-development", icon: "📱", title: "iOS Development", description: "Design beautiful, declarative user interfaces for all Apple platforms.", steps: `<h3>Introduction to iOS</h3><p>Building applications for Apple's mobile operating system.</p><h3>What is it?</h3><p>Using Swift and SwiftUI to create high-performance apps for the App Store.</p><h3>Where is it used?</h3><p>Every app you download on an iPhone or iPad is built using these technologies.</p>` },
            { id: "static-android-dev-jetpack", icon: "🚀", title: "Android Dev (Jetpack)", description: "Build modern, fluid Android applications using Kotlin and Jetpack Compose.", steps: `<h3>Introduction to Android</h3><p>Building applications for the world's most popular mobile operating system.</p><h3>What is Jetpack?</h3><p>A suite of libraries to help developers follow best practices and write better Android apps.</p><h3>Where is it used?</h3><p>Used to build native applications for Android devices worldwide.</p>` },
            { id: "static-qa-automation-testing", icon: "✅", title: "QA & Automation Testing", description: "Master Cypress, Selenium, and CI/CD testing pipelines for zero-defect software.", steps: `<h3>Introduction to QA</h3><p>Quality Assurance is the process of verifying whether a product meets specified requirements.</p><h3>What is Automation Testing?</h3><p>Using software to control the execution of tests to ensure higher reliability.</p><h3>Where is it used?</h3><p>In all serious software development teams to ensure software stability and performance.</p>` },
            { id: "static-devops-engineering", icon: "🔄", title: "DevOps Engineering", description: "Bridge the gap between development and operations for seamless continuous delivery.", steps: `<h3>Introduction to DevOps</h3><p>A set of practices that combines software development and IT operations.</p><h3>What is a DevOps Engineer?</h3><p>Someone who manages the tools and processes to automate software delivery and infrastructure changes.</p><h3>Where is it used?</h3><p>Critical for teams that want to deploy software multiple times a day with high confidence.</p>` },
            { id: "static-site-reliability-sre", icon: "🛡️", title: "Site Reliability (SRE)", description: "Apply software engineering practices to infrastructure and enterprise operations.", steps: `<h3>Introduction to SRE</h3><p>A discipline that incorporates aspects of software engineering and applies them to infrastructure.</p><h3>What is SRE?</h3><p>Focusing on reliability, availability, and performance of large-scale systems.</p><h3>Where is it used?</h3><p>Pioneered by Google to manage their massive global systems efficiently.</p>` },
            { id: "static-it-support-professional", icon: "🎧", title: "IT Support Professional", description: "Master troubleshooting, customer service, and systems administration fundamentals.", steps: `<h3>Introduction to IT Support</h3><p>Handling technical issues and maintaining the technological infrastructure of an organization.</p><h3>What is it?</h3><p>Troubleshooting hardware and software, managing users, and ensuring network connectivity.</p><h3>Where is it used?</h3><p>In every company that uses computers and technology for business operations.</p>` },
            { id: "static-network-engineering", icon: "🔌", title: "Network Engineering", description: "Configure, manage, and scale enterprise networks and core switching infrastructure.", steps: `<h3>Introduction to Networking</h3><p>Designing, implementing, and managing computer networks.</p><h3>What is Network Engineering?</h3><p>Configuring routers, switches, and firewalls to ensure seamless data flow.</p><h3>Where is it used?</h3><p>Behind the scenes of every office, data center, and internet service provider.</p>` },
            { id: "static-cloud-architecture", icon: "☁️", title: "Cloud Architecture", description: "Design multi-cloud strategies and infrastructure solutions for Azure and Google Cloud.", steps: `<h3>Introduction to Cloud Design</h3><p>Designing the structure of cloud environments for enterprise needs.</p><h3>What is it?</h3><p>Choosing the right cloud services to meet scalability, cost, and performance goals.</p><h3>Where is it used?</h3><p>Used by enterprises to move their legacy systems to the modern cloud environment.</p>` },
            { id: "static-it-project-management", icon: "📊", title: "IT Project Management", description: "Master resource planning, risk assessment, and technical project delivery lifecycles.", steps: `<h3>Introduction to IT PM</h3><p>Planning and managing technology projects from conception to completion.</p><h3>What is it?</h3><p>Managing budgets, timelines, and technical teams to deliver software or infrastructure.</p><h3>Where is it used?</h3><p>Ensuring complex tech projects stay on track and deliver value to the business.</p>` },
            { id: "static-data-engineering", icon: "🏗️", title: "Data Engineering", description: "Design complex data pipelines, warehouse architectures, and ETL processes.", steps: `<h3>Introduction to Data Eng</h3><p>The practice of designing and building systems for collecting, storing, and analyzing data at scale.</p><h3>What is it?</h3><p>Building the "plumbing" that allows data scientists to access clean, processed data.</p><h3>Where is it used?</h3><p>Crucial for companies that handle massive amounts of raw data from multiple sources.</p>` },
            { id: "static-business-intelligence", icon: "📈", title: "Business Intelligence", description: "Transform raw data into actionable enterprise insights using Tableau and PowerBI.", steps: `<h3>Introduction to BI</h3><p>The strategies and technologies used by enterprises for data analysis of business information.</p><h3>What is it?</h3><p>Turning data into dashboards and reports that help executives make better decisions.</p><h3>Where is it used?</h3><p>Used by management to track KPIs and understand market trends.</p>` },
            { id: "static-prompt-engineering-ai", icon: "🧠", title: "Prompt Engineering & AI", description: "Harness the power of generative AI, LLMs, and advanced prompt architecture.", steps: `<h3>Introduction to Prompts</h3><p>The practice of crafting inputs for generative AI to get the best possible results.</p><h3>What is Prompt Engineering?</h3><p>Optimizing how we talk to AI models like ChatGPT or Midjourney to achieve complex tasks.</p><h3>Where is it used?</h3><p>A new but vital skill for anyone working with modern AI productivity tools.</p>` }
        ];

        try {
            // Apply Live Editor Overrides
            let liveOverrides = {};
            try { liveOverrides = await apiFetch("/content/live"); } catch {}
            if (liveOverrides?.elements) {
                Object.entries(liveOverrides.elements).forEach(([sel, data]) => {
                    document.querySelectorAll(sel).forEach(el => {
                        if (data.deleted) { el.style.display = "none"; return; }
                        if (data.text) el.innerHTML = data.text;
                        if (data.fontSize) el.style.fontSize = data.fontSize + "px";
                        if (data.formation) el.style.textTransform = data.formation;
                        if (data.fontWeight) el.style.fontWeight = data.fontWeight;
                        if (data.color) el.style.color = data.color;
                        el.style.display = "";
                    });
                });
            }

            // Apply Home Content
            let homeContent = {};
            try { homeContent = await apiFetch("/content/home"); } catch {}
            if (homeContent && Object.keys(homeContent).length > 0) {
                const title = document.querySelector(".hero-title");
                const sub = document.querySelector(".hero-subtitle");
                if (title && homeContent.heroTitle) title.innerHTML = homeContent.heroTitle;
                if (sub && homeContent.heroSubtitle) sub.innerHTML = homeContent.heroSubtitle;
            }

            // Render Courses
            let courses = [...defaultCourses];
            try {
                const dbCourses = await apiFetch("/courses");
                if (dbCourses && dbCourses.length > 0) courses = dbCourses;
            } catch (e) {
                console.warn("DB Courses failed, using static list.");
            }

            const grid = document.querySelector(".courses-grid");
            if (grid) {
                grid.innerHTML = ""; // Clear hardcoded cards for fresh hydration
                courses.forEach(c => {
                    const card = document.createElement("div");
                    card.className = "course-card";
                    card.innerHTML = `<div class="course-icon">${c.icon}</div><h3>${c.title}</h3><p>${c.description}</p><div class="course-glow"></div>`;
                    
                    card.style.cursor = "pointer";
                    card.onclick = (e) => {
                        e.preventDefault();
                        
                        document.getElementById("cdTitle").textContent = c.title;
                        document.getElementById("cdDesc").textContent = c.description;
                        const media = document.getElementById("cdMedia");
                        media.innerHTML = ""; media.style.display = "none";
                        
                        if (c.photo) { 
                            media.innerHTML = `<img src="${c.photo}" alt="${c.title}">`; 
                            media.style.display = "block"; 
                        } else if (c.video) {
                            const isYT = c.video.includes("youtube.com") || c.video.includes("youtu.be");
                            media.innerHTML = isYT ? `<iframe width="100%" height="500" src="${c.video}" frameborder="0" allowfullscreen></iframe>` : `<video controls><source src="${c.video}"></video>`;
                            media.style.display = "block";
                        }
                        
                        const steps = document.getElementById("cdSteps");
                        const stepsText = document.getElementById("cdStepsText");
                        if (c.steps) { 
                            stepsText.innerHTML = c.steps; 
                            steps.style.display = "block"; 
                        } else {
                            steps.style.display = "none";
                        }
                        
                        window.appController.switchView("view-course-detail");
                    };
                    grid.appendChild(card);
                });
            }
        } catch (err) { console.error("CMS Hydration Error:", err); }
    }
    hydrateCMS();
});

// Password Visibility toggle
document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.getElementById(btn.getAttribute("data-target"));
        if (target.type === "password") {
            target.type = "text";
        } else {
            target.type = "password";
        }
    });
});

