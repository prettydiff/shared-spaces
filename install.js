import { exec } from "child_process";

(function install() {
    let step = 0;
    // eslint-disable-next-line
    const logger = console.log,
        steps = [
            "npm install -g typescript",
            "npm install",
            "tsc",
            "node js/application.js build",
            "share build"
        ],
        len = steps.length,
        text = {
            angry    : "\u001b[1m\u001b[31m",
            blue     : "\u001b[34m",
            bold     : "\u001b[1m",
            boldLine : "\u001b[1m\u001b[4m",
            clear    : "\u001b[24m\u001b[22m",
            cyan     : "\u001b[36m",
            green    : "\u001b[32m",
            noColor  : "\u001b[39m",
            none     : "\u001b[0m",
            purple   : "\u001b[35m",
            red      : "\u001b[31m",
            underline: "\u001b[4m",
            yellow   : "\u001b[33m"
        };
    (function install_execute() {
        logger(`Executing step ${steps + 1} of ${len}: ${text.cyan + steps[step] + text.none}`);
        exec(steps[step], function install_execute_callback(err) {
            if (err === null) {
                step = step + 1;
                if (step === len) {
                    logger("");
                    logger(`${text.green}Installation complete!${text.none}`);
                } else {
                    install_execute();
                }
            } else {
                logger(`${text.angry}Error installing application.${text.none}`);
                logger(JSON.stringify(err));
                process.exit(1);
            }
        });
    }());
}());