
/* lib/browser/utilities/webSocket - Handles web socket events and associated errors. This where most communications from outside the browser are processed. */
import browser from "./browser.js";
import receiver from "./receiver.js";

/**
 * Module definition for browser-side websocket handling.
 * ```typescript
 * interface module_browserSocket {
 *     error: () => void;                                                          // An error handling method.
 *     hash : string;                                                              // Stores a hash value used to authenticate a client hash tunnel at the server.
 *     send : (data:socketData) => void;                                           // Packages micro-service data for transmission in the application's micro-service format.
 *     sock : websocket_local;                                                     // Provides a web socket object in a way that allows for explicit type declarations, reuse, and without angering the TypeScript gods.
 *     start: (callback: () => void, hashDevice:string, type:string) => WebSocket; // Initiates a web socket client from the browser.
 *     type : string;                                                              // Stores the submitted type value.
 * }
 * ``` */
const webSocket:module_browserSocket = {
    error: function browser_utilities_socketError():void {
        setTimeout(function browser_utilities_socketError_delay():void {
            webSocket.start(null, webSocket.hash, webSocket.type);
        }, browser.ui.statusTime);
    },
    hash: "",
    sock: (function browser_utilities_socket():websocket_local {
        // A minor security circumvention.
        const socket:websocket_local = WebSocket as websocket_local;
        // eslint-disable-next-line no-global-assign
        WebSocket = null;
        return socket;
    }()),
    start: function browser_utilities_webSocket(callback:() => void, hashDevice:string, type:string):WebSocket {
        const title:HTMLElement = document.getElementById("title-bar"),
            scheme:string = (location.protocol.toLowerCase() === "http:")
                ? "ws"
                : "wss",
            socket:websocket_browser = new webSocket.sock(`${scheme}://localhost:${browser.network.port}/`, [`${type}-${hashDevice}`]) as websocket_browser,
            open = function browser_utilities_webSocket_socketOpen():void {
                if (title.getAttribute("class") === "title offline") {
                    location.reload();
                } else {
                    title.setAttribute("class", "title");
                    if (type === "primary") {
                        const messageDelay = function browser_init_complete_messageDelay():void {
                            if (browser.loadQueue.length > 0) {
                                browser.send(browser.loadQueue[0].data, browser.loadQueue[0].service);
                                browser.loadQueue.splice(0, 1);
                                if (browser.loadQueue.length > 0) {
                                    setTimeout(browser_init_complete_messageDelay, 5);
                                }
                            }
                        };
                        browser.socket = socket;
                        messageDelay();
                    }
                    socket.type = type;
                    if (callback !== null) {
                        callback();
                    }
                }
            },
            close = function browser_utilities_webSocket_socketClose():void {
                if (browser.identity.hashDevice !== "" && socket.type === "primary") {
                    const device:HTMLElement = document.getElementById(browser.identity.hashDevice),
                        agentList:HTMLElement = document.getElementById("agentList"),
                        active:HTMLCollectionOf<Element> = agentList.getElementsByClassName("status-active");
                    let a:number = active.length;
                    if (a > 0) {
                        do {
                            a = a - 1;
                            active[a].parentNode.setAttribute("class", "offline");
                        } while (a > 0);
                    }
                    browser.socket = null;
                    title.setAttribute("class", "title offline");
                    title.getElementsByTagName("h1")[0].appendText("Disconnected.", true);
                    if (device !== null) {
                        device.setAttribute("class", "offline");
                    }
                }
            };
        webSocket.hash = hashDevice;
        webSocket.type = type;

        /* Handle Web Socket responses */
        socket.onopen = open;
        socket.onmessage = receiver;
        socket.onclose = close;
        socket.onerror = function browser_utilities_webSocket_error():void {
            webSocket.error();
        };
        return browser.socket;
    },
    type: ""
};

export default webSocket;