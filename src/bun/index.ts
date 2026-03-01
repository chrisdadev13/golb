import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import type { AppRPC } from "../shared/types";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const rpc = BrowserView.defineRPC<AppRPC>({
	handlers: {
		requests: {
			openFolder: async () => {
				const paths = await Utils.openFileDialog({
					startingFolder: "~/",
					allowedFileTypes: "*",
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
				});

				if (!paths.length || (paths.length === 1 && paths[0] === "")) {
					return null;
				}

				return { paths };
			},
		},
		messages: {},
	},
});

// Create the main application window
const url = await getMainViewUrl();

new BrowserWindow({
	title: "Golb",
	url,
	rpc,
	frame: {
		width: 1200,
		height: 800,
		x: 200,
		y: 200,
	},
	titleBarStyle: "hiddenInset",
});

console.log("Golb started!");
