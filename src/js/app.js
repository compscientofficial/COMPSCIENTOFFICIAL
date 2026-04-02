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

    console.warn("Unmocked endpoint:", endpoint, method);
    return [];
}

// --- App Controller ---
document.addEventListener("DOMContentLoaded", () => {
    window.appController = {
        switchView: async (viewId) => {
            const user = auth.currentUser;
            
            // Route Guards
            if (viewId === "view-admin-dashboard") {
                if (!user) {
                    console.warn("Blocked: No active session.");
                    window.appController.switchView("view-landing");
                    return;
                }
                if (user.email !== "compscientofficial@gmail.com") {
                    alert("Access Denied: Administrative privileges required.");
                    window.appController.switchView("view-landing");
                    return;
                }
            } else if ((viewId === "view-student-dashboard" || viewId === "view-course-detail") && !user) {
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
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            const name = document.getElementById("name").value;
            const userClass = document.getElementById("userClass").value;

            if (!validateEmail(email)) {
                showAuthMsg("signupAuthMsg", "Please enter a valid email address.", "error");
                return;
            }
            if (!validatePassword(password)) {
                showAuthMsg("signupAuthMsg", "Password must be at least 8 characters, include an uppercase letter, a number, and a special character.", "error");
                return;
            }

            const btn = signupForm.querySelector('button[type="submit"]');
            const content = signupForm.closest(".modal-content");
            const loader = signupForm.closest("dialog").querySelector(".modal-loader");

            try {
                btn.disabled = true;
                btn.innerText = "Creating Account...";
                content.classList.add("hidden");
                loader.classList.add("active");

                const result = await createUserWithEmailAndPassword(auth, email, password);
                const user = result.user;
                const role = email === "compscientofficial@gmail.com" ? "admin" : "student";

                await apiFetch("/user/profile", "POST", { name, email, role, userClass });

                if (role !== "admin") {
                    await sendEmailVerification(user);
                    showAuthMsg("signupAuthMsg", "Verification email sent! Please check your inbox.", "success");
                } else {
                    showAuthMsg("signupAuthMsg", "Admin account registered successfully!", "success");
                }

                setTimeout(() => {
                    closeModal(signupModal);
                    content.classList.remove("hidden");
                    loader.classList.remove("active");
                }, 3000);

            } catch (err) {
                console.error(err);
                content.classList.remove("hidden");
                loader.classList.remove("active");
                showAuthMsg("signupAuthMsg", err.message, "error");
                btn.disabled = false;
                btn.innerText = "Create Account";
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
                    await apiFetch("/auth/log-error", "POST", { attemptedEmail: email, errorMessage: err.message, code: err.code });
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
    [document.getElementById("googleLoginBtn"), document.getElementById("googleSignupBtn")].forEach(btn => {
        if (btn) {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                const provider = new GoogleAuthProvider();
                try {
                    const result = await signInWithPopup(auth, provider);
                    const user = result.user;
                    try {
                        await apiFetch("/user/profile");
                    } catch {
                        const profile = { name: user.displayName, email: user.email, role: "student", userClass: "Self-Signed" };
                        await apiFetch("/user/profile", "POST", profile);
                    }
                } catch (err) { console.error("Google Auth Error:", err); }
            });
        }
    });

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

                if (isAdmin) {
                    if (document.getElementById("view-landing").classList.contains("active")) {
                        window.appController.switchView("view-admin-dashboard");
                    }
                    if (!window.adminInitialized) {
                        initAdmin();
                        window.adminInitialized = true;
                    }
                } else {
                    populateUserDashboard(user, profile);
                    if (document.getElementById("view-landing").classList.contains("active")) {
                        window.appController.switchView("view-student-dashboard");
                    }
                }
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
            { id: "static-ai-ml-engineers", icon: "🤖", title: "AI/ML Engineers", description: "Master artificial intelligence and machine learning to build intelligent systems.", steps: "<h3>AI/ML Engineers</h3><p>Detailed curriculum coming soon for AI/ML Engineers.</p>" },
            { id: "static-cloud-architects", icon: "☁️", title: "Cloud Architects", description: "Design and deploy scalable, secure, and highly available cloud infrastructure.", steps: "<h3>Cloud Architects</h3><p>Detailed curriculum coming soon for Cloud Architects.</p>" },
            { id: "static-cybersecurity-analysts", icon: "🛡️", title: "Cybersecurity Analysts", description: "Protect networks and systems by monitoring, detecting, and responding to threats.", steps: "<h3>Cybersecurity Analysts</h3><p>Detailed curriculum coming soon for Cybersecurity Analysts.</p>" },
            { id: "static-data-scientists", icon: "📊", title: "Data Scientists", description: "Analyze complex data sets to drive strategic business decisions and insights.", steps: "<h3>Data Scientists</h3><p>Detailed curriculum coming soon for Data Scientists.</p>" },
            { id: "static-full-stack-developers", icon: "💻", title: "Full Stack Developers", description: "Build end-to-end web applications bridging frontend interfaces and backend systems.", steps: "<h3>Full Stack Developers</h3><p>Detailed curriculum coming soon for Full Stack Developers.</p>" },
            { id: "static-html-css", icon: "🌐", title: "HTML & CSS", description: "Build the structural and visual foundation of modern, responsive websites.", steps: "<h3>HTML & CSS</h3><p>Detailed curriculum coming soon for HTML & CSS.</p>" },
            { id: "static-js", icon: "⚡", title: "JavaScript (JS)", description: "Create dynamic, interactive user experiences and complex web applications.", steps: "<h3>JavaScript (JS)</h3><p>Detailed curriculum coming soon for JavaScript (JS).</p>" },
            { id: "static-java", icon: "☕", title: "Java", description: "Master robust, object-oriented programming for enterprise and mobile solutions.", steps: "<h3>Java</h3><p>Detailed curriculum coming soon for Java.</p>" },
            { id: "static-python", icon: "🐍", title: "Python", description: "Learn artificial intelligence, data science, and backend development.", steps: "<h3>Python</h3><p>Detailed curriculum coming soon for Python.</p>" },
            { id: "static-cpp", icon: "⚙️", title: "C++", description: "Build high-performance applications, game engines, and system software.", steps: "<h3>C++</h3><p>Detailed curriculum coming soon for C++.</p>" },
            { id: "static-csharp", icon: "🎯", title: "C#", description: "Develop Windows applications, enterprise software, and Unity games.", steps: "<h3>C#</h3><p>Detailed curriculum coming soon for C#.</p>" },
            { id: "static-php", icon: "🐘", title: "PHP", description: "Script server-side web applications and master content management systems.", steps: "<h3>PHP</h3><p>Detailed curriculum coming soon for PHP.</p>" },
            { id: "static-ruby", icon: "💎", title: "Ruby", description: "Rapidly build web applications with an elegant and readable syntax.", steps: "<h3>Ruby</h3><p>Detailed curriculum coming soon for Ruby.</p>" },
            { id: "static-swift", icon: "🍎", title: "Swift", description: "Create fluid, native and fast applications for the Apple ecosystem.", steps: "<h3>Swift</h3><p>Detailed curriculum coming soon for Swift.</p>" },
            { id: "static-go", icon: "🐹", title: "Go", description: "Build incredibly fast, reliable, and scalable backend infrastructure.", steps: "<h3>Go</h3><p>Detailed curriculum coming soon for Go.</p>" },
            { id: "static-software-engineer", icon: "🏗️", title: "Software Engineer", description: "Learn the principles of software engineering to design, build, and maintain large-scale systems.", steps: "<h3>Software Engineer</h3><p>Detailed curriculum coming soon for Software Engineer.</p>" },
            { id: "static-full-stack-development", icon: "💻", title: "Full Stack Development", description: "Master APIs, databases, and front-end frameworks to build end-to-end applications.", steps: "<h3>Full Stack Development</h3><p>Detailed curriculum coming soon for Full Stack Development.</p>" },
            { id: "static-cloud-computing-devops", icon: "☁️", title: "Cloud Computing & DevOps", description: "Learn to deploy, scale, and manage infrastructure with AWS, Docker, and CI/CD pipelines.", steps: "<h3>Cloud Computing & DevOps</h3><p>Detailed curriculum coming soon for Cloud Computing & DevOps.</p>" },
            { id: "static-data-science-ai", icon: "🧠", title: "Data Science & AI", description: "Train machine learning models, analyze vast datasets, and leverage artificial intelligence.", steps: "<h3>Data Science & AI</h3><p>Detailed curriculum coming soon for Data Science & AI.</p>" },
            { id: "static-mobile-app-development", icon: "📱", title: "Mobile App Development", description: "Build native and cross-platform applications with modern technologies like React Native and Flutter.", steps: "<h3>Mobile App Development</h3><p>Detailed curriculum coming soon for Mobile App Development.</p>" },
            { id: "static-cybersecurity-hacking", icon: "🛡️", title: "Cybersecurity & Hacking", description: "Learn to secure networks, find vulnerabilities, and protect enterprise digital assets.", steps: "<h3>Cybersecurity & Hacking</h3><p>Detailed curriculum coming soon for Cybersecurity & Hacking.</p>" },
            { id: "static-game-developer", icon: "🎮", title: "Game Developer", description: "Dive into graphics programming, physics engines, and advanced game logic architecture.", steps: "<h3>Game Developer</h3><p>Detailed curriculum coming soon for Game Developer.</p>" },
            { id: "static-rust", icon: "🦀", title: "Rust", description: "Build blazing fast, memory-safe systems and modern backend applications.", steps: "<h3>Rust</h3><p>Detailed curriculum coming soon for Rust.</p>" },
            { id: "static-kotlin", icon: "🚀", title: "Kotlin", description: "Develop modern, expressive, and safe Android applications seamlessly.", steps: "<h3>Kotlin</h3><p>Detailed curriculum coming soon for Kotlin.</p>" },
            { id: "static-typescript", icon: "📘", title: "TypeScript", description: "Supercharge your JavaScript with static typing and modern architectural patterns.", steps: "<h3>TypeScript</h3><p>Detailed curriculum coming soon for TypeScript.</p>" },
            { id: "static-sql-databases", icon: "🗄️", title: "SQL & Databases", description: "Master relational databases, data modeling, and complex querying optimizations.", steps: "<h3>SQL & Databases</h3><p>Detailed curriculum coming soon for SQL & Databases.</p>" },
            { id: "static-nosql-mongodb", icon: "🍃", title: "NoSQL & MongoDB", description: "Build scalable, flexible database architectures for modern web applications.", steps: "<h3>NoSQL & MongoDB</h3><p>Detailed curriculum coming soon for NoSQL & MongoDB.</p>" },
            { id: "static-blockchain-web3", icon: "⛓️", title: "Blockchain & Web3", description: "Build decentralized applications, smart contracts, and Web3 solutions.", steps: "<h3>Blockchain & Web3</h3><p>Detailed curriculum coming soon for Blockchain & Web3.</p>" },
            { id: "static-machine-learning", icon: "🤖", title: "Machine Learning", description: "Design algorithms that learn from data and predict smart future outcomes.", steps: "<h3>Machine Learning</h3><p>Detailed curriculum coming soon for Machine Learning.</p>" },
            { id: "static-deep-learning", icon: "🧬", title: "Deep Learning", description: "Dive into neural networks, natural language processing, and computer vision.", steps: "<h3>Deep Learning</h3><p>Detailed curriculum coming soon for Deep Learning.</p>" },
            { id: "static-penetration-testing", icon: "🥷", title: "Penetration Testing", description: "Master advanced ethical hacking to discover and exploit critical vulnerabilities.", steps: "<h3>Penetration Testing</h3><p>Detailed curriculum coming soon for Penetration Testing.</p>" },
            { id: "static-ui-ux-design", icon: "🎨", title: "UI/UX Design", description: "Design intuitive, highly accessible, and stunning user interfaces and experiences.", steps: "<h3>UI/UX Design</h3><p>Detailed curriculum coming soon for UI/UX Design.</p>" },
            { id: "static-docker-kubernetes", icon: "🐳", title: "Docker & Kubernetes", description: "Containerize and orchestrate massive scalable applications across clusters.", steps: "<h3>Docker & Kubernetes</h3><p>Detailed curriculum coming soon for Docker & Kubernetes.</p>" },
            { id: "static-linux-administration", icon: "🐧", title: "Linux Administration", description: "Master the command line, kernel architecture, and robust server management.", steps: "<h3>Linux Administration</h3><p>Detailed curriculum coming soon for Linux Administration.</p>" },
            { id: "static-digital-forensics", icon: "🕵️", title: "Digital Forensics", description: "Analyze digital evidence, complex network traffic, and malicious malware behavior.", steps: "<h3>Digital Forensics</h3><p>Detailed curriculum coming soon for Digital Forensics.</p>" },
            { id: "static-internet-of-things-iot", icon: "🔌", title: "Internet of Things (IoT)", description: "Connect smart devices, robust sensors, and microcontrollers to the modern web.", steps: "<h3>Internet of Things (IoT)</h3><p>Detailed curriculum coming soon for Internet of Things (IoT).</p>" },
            { id: "static-augmented-reality-ar", icon: "👓", title: "Augmented Reality (AR)", description: "Build highly immersive AR experiences for both mobile and spatial web platforms.", steps: "<h3>Augmented Reality (AR)</h3><p>Detailed curriculum coming soon for Augmented Reality (AR).</p>" },
            { id: "static-virtual-reality-vr", icon: "🥽", title: "Virtual Reality (VR)", description: "Develop fully immersive, 3D interactive and engaging virtual environments.", steps: "<h3>Virtual Reality (VR)</h3><p>Detailed curriculum coming soon for Virtual Reality (VR).</p>" },
            { id: "static-big-data-analytics", icon: "📊", title: "Big Data Analytics", description: "Process, safely analyze, and visualize massive datasets using modern data tools.", steps: "<h3>Big Data Analytics</h3><p>Detailed curriculum coming soon for Big Data Analytics.</p>" },
            { id: "static-system-architecture", icon: "📐", title: "System Architecture", description: "Design scalable, highly fault-tolerant, and performant enterprise software systems.", steps: "<h3>System Architecture</h3><p>Detailed curriculum coming soon for System Architecture.</p>" },
            { id: "static-agile-scrum", icon: "🏃", title: "Agile & Scrum", description: "Master standard modern project management and software delivery methodologies.", steps: "<h3>Agile & Scrum</h3><p>Detailed curriculum coming soon for Agile & Scrum.</p>" },
            { id: "static-react-next-js", icon: "⚛️", title: "React & Next.js", description: "Build dynamic, beautifully SEO-friendly, and blazing-fast web applications.", steps: "<h3>React & Next.js</h3><p>Detailed curriculum coming soon for React & Next.js.</p>" },
            { id: "static-node-js-backend", icon: "🟩", title: "Node.js Backend", description: "Build scalable, extremely event-driven backend services and reliable REST APIs.", steps: "<h3>Node.js Backend</h3><p>Detailed curriculum coming soon for Node.js Backend.</p>" },
            { id: "static-aws-cloud-practitioner", icon: "☁️", title: "AWS Cloud Practitioner", description: "Master the core Amazon Web Services cloud ecosystem and infrastructure provisioning.", steps: "<h3>AWS Cloud Practitioner</h3><p>Detailed curriculum coming soon for AWS Cloud Practitioner.</p>" },
            { id: "static-ethical-hacking-ceh", icon: "🔓", title: "Ethical Hacking (CEH)", description: "Learn professional security testing and deep vulnerability assessment methodologies.", steps: "<h3>Ethical Hacking (CEH)</h3><p>Detailed curriculum coming soon for Ethical Hacking (CEH).</p>" },
            { id: "static-frontend-engineering", icon: "⚛️", title: "Frontend Engineering", description: "Master component-driven UI architecture, state management, and web performance optimization.", steps: "<h3>Frontend Engineering</h3><p>Detailed curriculum coming soon for Frontend Engineering.</p>" },
            { id: "static-backend-architecture", icon: "⚙️", title: "Backend Architecture", description: "Design and deploy robust, high-availability server-side logic and microservices.", steps: "<h3>Backend Architecture</h3><p>Detailed curriculum coming soon for Backend Architecture.</p>" },
            { id: "static-database-administration", icon: "🗄️", title: "Database Administration", description: "Learn performance tuning, security, and maintenance of critical enterprise databases.", steps: "<h3>Database Administration</h3><p>Detailed curriculum coming soon for Database Administration.</p>" },
            { id: "static-mern-stack-masterclass", icon: "🍃", title: "MERN Stack Masterclass", description: "Build comprehensive web applications using MongoDB, Express.js, React, and Node.js.", steps: "<h3>MERN Stack Masterclass</h3><p>Detailed curriculum coming soon for MERN Stack Masterclass.</p>" },
            { id: "static-mean-stack-development", icon: "🌐", title: "MEAN Stack Development", description: "Develop robust full-stack applications with MongoDB, Express, Angular, and Node.js.", steps: "<h3>MEAN Stack Development</h3><p>Detailed curriculum coming soon for MEAN Stack Development.</p>" },
            { id: "static-django-web-framework", icon: "🛠️", title: "Django Web Framework", description: "Rapidly construct secure and maintainable database-driven websites using Python.", steps: "<h3>Django Web Framework</h3><p>Detailed curriculum coming soon for Django Web Framework.</p>" },
            { id: "static-spring-boot-developer", icon: "☕", title: "Spring Boot Developer", description: "Create production-grade, stand-alone Spring applications for enterprise Java systems.", steps: "<h3>Spring Boot Developer</h3><p>Detailed curriculum coming soon for Spring Boot Developer.</p>" },
            { id: "static-asp-net-core-systems", icon: "🎯", title: "ASP.NET Core Systems", description: "Build modern, cloud-based, and internet-connected applications using C# and .NET.", steps: "<h3>ASP.NET Core Systems</h3><p>Detailed curriculum coming soon for ASP.NET Core Systems.</p>" },
            { id: "static-ios-development", icon: "📱", title: "iOS Development", description: "Design beautiful, declarative user interfaces for all Apple platforms.", steps: "<h3>iOS Development</h3><p>Detailed curriculum coming soon for iOS Development.</p>" },
            { id: "static-android-dev-jetpack", icon: "🚀", title: "Android Dev (Jetpack)", description: "Build modern, fluid Android applications using Kotlin and Jetpack Compose.", steps: "<h3>Android Dev (Jetpack)</h3><p>Detailed curriculum coming soon for Android Dev (Jetpack).</p>" },
            { id: "static-qa-automation-testing", icon: "✅", title: "QA & Automation Testing", description: "Master Cypress, Selenium, and CI/CD testing pipelines for zero-defect software.", steps: "<h3>QA & Automation Testing</h3><p>Detailed curriculum coming soon for QA & Automation Testing.</p>" },
            { id: "static-devops-engineering", icon: "🔄", title: "DevOps Engineering", description: "Bridge the gap between development and operations for seamless continuous delivery.", steps: "<h3>DevOps Engineering</h3><p>Detailed curriculum coming soon for DevOps Engineering.</p>" },
            { id: "static-site-reliability-sre", icon: "🛡️", title: "Site Reliability (SRE)", description: "Apply software engineering practices to infrastructure and enterprise operations.", steps: "<h3>Site Reliability (SRE)</h3><p>Detailed curriculum coming soon for Site Reliability (SRE).</p>" },
            { id: "static-it-support-professional", icon: "🎧", title: "IT Support Professional", description: "Master troubleshooting, customer service, and systems administration fundamentals.", steps: "<h3>IT Support Professional</h3><p>Detailed curriculum coming soon for IT Support Professional.</p>" },
            { id: "static-network-engineering", icon: "🔌", title: "Network Engineering", description: "Configure, manage, and scale enterprise networks and core switching infrastructure.", steps: "<h3>Network Engineering</h3><p>Detailed curriculum coming soon for Network Engineering.</p>" },
            { id: "static-cloud-architecture", icon: "☁️", title: "Cloud Architecture", description: "Design multi-cloud strategies and infrastructure solutions for Azure and Google Cloud.", steps: "<h3>Cloud Architecture</h3><p>Detailed curriculum coming soon for Cloud Architecture.</p>" },
            { id: "static-it-project-management", icon: "📊", title: "IT Project Management", description: "Master resource planning, risk assessment, and technical project delivery lifecycles.", steps: "<h3>IT Project Management</h3><p>Detailed curriculum coming soon for IT Project Management.</p>" },
            { id: "static-data-engineering", icon: "🏗️", title: "Data Engineering", description: "Design complex data pipelines, warehouse architectures, and ETL processes.", steps: "<h3>Data Engineering</h3><p>Detailed curriculum coming soon for Data Engineering.</p>" },
            { id: "static-business-intelligence", icon: "📈", title: "Business Intelligence", description: "Transform raw data into actionable enterprise insights using Tableau and PowerBI.", steps: "<h3>Business Intelligence</h3><p>Detailed curriculum coming soon for Business Intelligence.</p>" },
            { id: "static-prompt-engineering-ai", icon: "🧠", title: "Prompt Engineering & AI", description: "Harness the power of generative AI, LLMs, and advanced prompt architecture.", steps: "<h3>Prompt Engineering & AI</h3><p>Detailed curriculum coming soon for Prompt Engineering & AI.</p>" }
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
            const grid = document.querySelector(".courses-grid");
            if (grid) {
                const isAdmin = auth.currentUser?.email === "compscientofficial@gmail.com";
                let courses = [...defaultCourses];
                try {
                    const dbCourses = await apiFetch("/content/courses");
                    if (dbCourses?.length > 0) courses = courses.concat(dbCourses);
                } catch (err) { console.error("Firestore Courses fetch failed:", err); }

                grid.innerHTML = "";
                courses.forEach(c => {
                    const card = document.createElement("div");
                    card.className = `course-card ${isAdmin ? "admin-mode" : ""}`;
                    let actions = isAdmin ? `
                        <div class="admin-course-actions">
                            <button class="btn btn-outline btn-small edit-course-btn" data-id="${c.id}">Edit</button>
                            <button class="btn btn-outline btn-small delete-course-btn" style="color:var(--error-color);" data-id="${c.id}">DEL</button>
                        </div>
                    ` : "";
                    card.innerHTML = `${actions}<div class="course-icon">${c.icon}</div><h3>${c.title}</h3><p>${c.description}</p><div class="course-glow"></div>`;
                    
                    if (!isAdmin) {
                        card.style.cursor = "pointer";
                        card.onclick = () => {
                            if (!auth.currentUser) { loginModal.showModal(); loginModal.classList.add("show"); return; }
                            document.getElementById("cdTitle").textContent = c.title;
                            document.getElementById("cdDesc").textContent = c.description;
                            const media = document.getElementById("cdMedia");
                            media.innerHTML = ""; media.style.display = "none";
                            if (c.photo) { media.innerHTML = `<img src="${c.photo}" alt="${c.title}">`; media.style.display = "block"; }
                            else if (c.video) {
                                const isYT = c.video.includes("youtube.com") || c.video.includes("youtu.be");
                                media.innerHTML = isYT ? `<iframe width="100%" height="500" src="${c.video}" frameborder="0" allowfullscreen></iframe>` : `<video controls><source src="${c.video}"></video>`;
                                media.style.display = "block";
                            }
                            const steps = document.getElementById("cdSteps");
                            const stepsText = document.getElementById("cdStepsText");
                            if (c.steps) { stepsText.innerHTML = c.steps; steps.style.display = "block"; } else steps.style.display = "none";
                            window.appController.switchView("view-course-detail");
                        };
                    }
                    grid.appendChild(card);
                });

                if (isAdmin) {
                    const addCard = document.createElement("div");
                    addCard.className = "add-course-card";
                    addCard.innerHTML = `<div class="plus-icon">+</div><h3>Add New Course</h3>`;
                    addCard.onclick = () => window.openCourseModal();
                    grid.appendChild(addCard);
                    
                    document.querySelectorAll(".edit-course-btn").forEach(b => b.onclick = (e) => { e.stopPropagation(); window.openCourseModal(b.getAttribute("data-id")); });
                    document.querySelectorAll(".delete-course-btn").forEach(b => b.onclick = (e) => { e.stopPropagation(); window.deleteCourse(b.getAttribute("data-id")); });
                }
            }
        } catch (err) { console.error("CMS Hydration Error:", err); }
    }
    hydrateCMS();
});

// --- Dashboard Logic ---
function populateUserDashboard(user, profile) {
    const role = profile.role || "student";
    const shortName = profile.name.split(" ")[0];
    document.getElementById("userName").textContent = profile.name;
    document.getElementById("userEmail").textContent = profile.email;
    document.getElementById("userRole").textContent = role.toUpperCase();
    document.getElementById("userInitial").textContent = shortName.charAt(0).toUpperCase();
    document.getElementById("dashWelcome").textContent = `Welcome, ${shortName}`;
    if (profile.class) document.getElementById("userClassDisplay").textContent = profile.class;
    if (role === "admin" || role === "staff") document.getElementById("adminPanel").style.display = "block";
}

// --- Admin Panel Logic ---
function initAdmin() {
    const navItems = document.querySelectorAll(".admin-nav-item");
    const panels = document.querySelectorAll(".admin-panel");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            navItems.forEach(i => i.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));
            item.classList.add("active");
            document.getElementById(target).classList.add("active");
        });
    });

    if (!document.querySelector(".admin-panel.active")) navItems[0].click();

    loadAdminHistory();
    loadAdminUsers();
    loadAdminErrors();
    loadAdminCMS();
    loadAdminCourses();
    initLiveEditor();
}

async function loadAdminHistory() {
    const tbody = document.querySelector("#historyTable tbody");
    try {
        const history = await apiFetch("/admin/login-history");
        tbody.innerHTML = history.length ? history.map(h => `<tr><td>${new Date(h.timestamp).toLocaleString()}</td><td>Admin Login (UID: ${h.uid.substring(0,6)}...)</td></tr>`).join('') : '<tr><td colspan="2">No history.</td></tr>';
    } catch(err) { console.error(err); }
}

async function loadAdminUsers() {
    const tbody = document.querySelector("#usersTable tbody");
    try {
        const users = await apiFetch("/admin/users");
        tbody.innerHTML = users.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.class||"N/A"}</td><td>${u.role}</td><td><button class="btn btn-danger btn-small" onclick="window.deleteUser('${u.id||u.uid}')">Delete</button></td></tr>`).join('');
    } catch(err) { console.error(err); }
}

async function loadAdminErrors() {
    const tbody = document.querySelector("#errorsTable tbody");
    try {
        const errors = await apiFetch("/admin/errors");
        tbody.innerHTML = errors.map(e => `<tr><td>${new Date(e.timestamp).toLocaleString()}</td><td>${e.attemptedEmail}</td><td>${e.errorMessage}</td><td><button class="btn btn-danger btn-small" onclick="window.deleteError('${e.id}')">Delete</button></td></tr>`).join('');
    } catch(err) { console.error(err); }
}

window.deleteError = async (id) => {
    if (confirm("Clear all logs?")) {
        await apiFetch("/admin/errors", "DELETE");
        loadAdminErrors();
    }
};

window.deleteUser = async (id) => {
    if (confirm("Delete user profile?")) {
        await apiFetch(`/admin/users/${id}`, "DELETE");
        loadAdminUsers();
    }
};

async function loadAdminCMS() {
    try {
        const data = await apiFetch("/content/home");
        if (data) {
            document.getElementById("cmsHeroTitle").value = data.heroTitle || "";
            document.getElementById("cmsHeroSubtitle").value = data.heroSubtitle || "";
        }
    } catch {}
}

document.getElementById("cmsHomeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await apiFetch("/admin/cms/home", "PUT", {
        heroTitle: document.getElementById("cmsHeroTitle").value,
        heroSubtitle: document.getElementById("cmsHeroSubtitle").value,
        updatedAt: new Date().toISOString()
    });
    alert("Home updated!");
    window.location.reload();
});

async function loadAdminCourses() {
    const tbody = document.querySelector("#coursesTable tbody");
    if (!tbody) return;
    try {
        const courses = await apiFetch("/content/courses");
        tbody.innerHTML = courses.map(c => `<tr><td>${c.icon}</td><td>${c.title}</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.description}</td><td><button class="btn btn-outline btn-small" onclick="window.openCourseModal('${c.id}')">Edit</button> <button class="btn btn-danger btn-small" onclick="window.deleteCourse('${c.id}')">Delete</button></td></tr>`).join('');
    } catch(err) { console.error(err); }
}

const courseModal = document.getElementById("courseModal");
const courseForm = document.getElementById("courseForm");

window.openCourseModal = async (id = null) => {
    courseForm.reset();
    const titleEl = document.getElementById("courseModalTitle");
    const idInput = document.getElementById("editCourseId");
    if (id) {
        titleEl.textContent = "Edit Course";
        idInput.value = id;
        const all = await apiFetch("/content/courses");
        const c = all.find(x => x.id === id);
        if (c) {
            document.getElementById("courseTitle").value = c.title || "";
            document.getElementById("courseIcon").value = c.icon || "";
            document.getElementById("courseDesc").value = c.description || "";
            document.getElementById("coursePhoto").value = c.photo || "";
            document.getElementById("courseVideo").value = c.video || "";
            document.getElementById("courseStepsContent").value = c.steps || "";
            document.getElementById("courseOrder").value = c.order || 0;
        }
    } else {
        titleEl.textContent = "Add New Course";
        idInput.value = "";
    }
    courseModal.showModal();
    courseModal.classList.add("show");
};

courseForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editCourseId").value || document.getElementById("courseTitle").value.toLowerCase().replace(/ /g, "-");
    const data = {
        title: document.getElementById("courseTitle").value,
        icon: document.getElementById("courseIcon").value,
        description: document.getElementById("courseDesc").value,
        photo: document.getElementById("coursePhoto").value,
        video: document.getElementById("courseVideo").value,
        steps: document.getElementById("courseStepsContent").value,
        order: parseInt(document.getElementById("courseOrder").value) || Date.now(),
        updatedAt: new Date().toISOString()
    };
    const method = document.getElementById("editCourseId").value ? "PUT" : "POST";
    await apiFetch(method === "PUT" ? `/admin/courses/${id}` : "/admin/courses", method, { id, ...data });
    courseModal.classList.remove("show");
    setTimeout(() => courseModal.close(), 300);
    window.location.reload();
});

window.deleteCourse = async (id) => {
    if (confirm("Delete course?")) {
        await apiFetch(`/admin/courses/${id}`, "DELETE");
        window.location.reload();
    }
};

// --- Live Editor Logic ---
let activeEditorEl = null;
let currentOverrides = {};

function initLiveEditor() {
    const preview = document.getElementById("liveEditorPreview");
    const source = document.getElementById("view-landing");
    if (!source || !preview) return;

    const clone = source.cloneNode(true);
    clone.querySelectorAll("script, .loader-container").forEach(s => s.remove());
    clone.classList.add("active");
    clone.style.display = "block";
    preview.innerHTML = "";
    preview.appendChild(clone);

    // Initial Load
    apiFetch("/content/live").then(res => {
        if (res?.elements) {
            currentOverrides = res.elements;
            applyLiveOverrides(preview, currentOverrides);
        }
    });

    preview.addEventListener("mouseover", (e) => e.target.classList.add("edit-hover"));
    preview.addEventListener("mouseout", (e) => e.target.classList.remove("edit-hover"));
    preview.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeEditorEl) activeEditorEl.classList.remove("editing-active");
        activeEditorEl = e.target;
        activeEditorEl.classList.add("editing-active");
        openElementEditor(activeEditorEl);
    });

    document.getElementById("saveLiveChanges")?.addEventListener("click", async () => {
        const btn = document.getElementById("saveLiveChanges");
        btn.disabled = true; btn.innerText = "Saving...";
        await apiFetch("/admin/cms/live", "PUT", { elements: currentOverrides, updatedAt: new Date().toISOString() });
        alert("Website updated!");
        window.location.reload();
    });
}

function openElementEditor(el) {
    document.getElementById("editorSidebarEmpty").style.display = "none";
    document.getElementById("editorControls").style.display = "block";
    document.getElementById("editElementText").value = el.innerText || el.innerHTML;
    const style = window.getComputedStyle(el);
    document.getElementById("editElementFontSize").value = parseInt(style.fontSize);
    
    document.getElementById("editElementText").oninput = (e) => { el.innerHTML = e.target.value; updateOverride(el, { text: e.target.value }); };
    document.getElementById("editElementFontSize").oninput = (e) => { el.style.fontSize = e.target.value + "px"; updateOverride(el, { fontSize: e.target.value }); };
}

function updateOverride(el, data) {
    const selector = getSelector(el);
    currentOverrides[selector] = { ...currentOverrides[selector], ...data };
}

function getSelector(el) {
    if (el.id) return "#" + el.id;
    if (el.classList.contains("hero-title")) return ".hero-title";
    if (el.classList.contains("hero-subtitle")) return ".hero-subtitle";
    return el.tagName.toLowerCase(); // Simplified for now
}

function applyLiveOverrides(root, overrides) {
    Object.entries(overrides).forEach(([sel, data]) => {
        root.querySelectorAll(sel).forEach(el => {
            if (data.text) el.innerHTML = data.text;
            if (data.fontSize) el.style.fontSize = data.fontSize + "px";
        });
    });
}

// Password Visibility toggle
document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.getElementById(btn.getAttribute("data-target"));
        if (target.type === "password") {
            target.type = "text";
            btn.innerHTML = "🙈";
        } else {
            target.type = "password";
            btn.innerHTML = '<i class="eye-icon"></i>';
        }
    });
});