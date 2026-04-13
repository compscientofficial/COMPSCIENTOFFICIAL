// COMPSCIENT Security Module
// Enforces strict client-side anti-inspection rules

(function() {
    // 1. Disable Right-Click Context Menu
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // 2. Block Keyboard Shortcuts for Inspection and Source Viewing
    document.addEventListener('keydown', function(e) {
        // F12 key
        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }

        // Ctrl + Shift + I (Open DevTools)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }

        // Ctrl + Shift + J (Open DevTools Console)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }

        // Ctrl + Shift + C (Inspect Element)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }

        // Ctrl + U (View Source)
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }
        
        // Ctrl + S (Save Page)
        if (e.ctrlKey && e.keyCode === 83) {
            e.preventDefault();
            return false;
        }
    });

    // 3. DevTools Trap (Freezes DevTools if forcibly opened)
    const devtoolsProtection = function() {
        setInterval(function() {
            const before = new Date().getTime();
            debugger; // If devtools are open, execution pauses here.
            const after = new Date().getTime();
            
            // If it took longer than a few milliseconds, devtools might be pausing it
            if (after - before > 100) {
                document.body.innerHTML = "<div style='display:flex;justify-content:center;align-items:center;height:100vh;background:black;color:red;font-size:24px;font-family:sans-serif;'>Security Violation: Inspection Tools Detected. Access Denied.</div>";
            }
        }, 1000); // Check every second
    };

    // Initialize trap
    devtoolsProtection();

    // 4. Aggressive Console Obfuscation & Silencing
    console.log("%cSTOP!", "color: red; font-size: 50px; font-weight: bold; text-shadow: 2px 2px 0 #000;");
    console.log("%cThis is a restricted, secure environment. Unauthorized inspection is prohibited.", "color: #fff; font-size: 16px; background: #000; padding: 10px; border-radius: 5px;");
    
    setInterval(function() {
        console.clear();
        console.log("%c[ENCRYPTED DATA STREAM ACTIVE 0x" + Math.random().toString(16).substring(2,8).toUpperCase() + "]", "color: #00FF00; background: #000; font-family: monospace;");
    }, 2500);

    const _origLog = console.log;
    const methods = ['log', 'info', 'warn', 'error', 'table', 'trace', 'dir'];
    
    methods.forEach(method => {
        console[method] = function() {
            _origLog.call(console, "%c[SYS_KERNEL_ERR] Mem Access Violation. SIG: " + btoa(Math.random().toString()).substring(0, 20), "color: #333; font-style: italic;");
        };
    });
})();
