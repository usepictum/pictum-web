import { definePictumElements } from "@pictum/web";
import "./style.css";

definePictumElements();

const icon = document.querySelector("pictum-icon");
const iconStatus = document.querySelector("#icon-status");

icon?.addEventListener("load", () => {
	if (iconStatus !== null) {
		iconStatus.textContent = "Loaded";
		iconStatus.classList.add("is-loaded");
	}
});

icon?.addEventListener("error", () => {
	if (iconStatus !== null) {
		iconStatus.textContent = "Error";
		iconStatus.classList.add("is-error");
	}
});

const identities = [
	{ seed: "ada-lovelace", alt: "Ada Lovelace" },
	{ seed: "grace-hopper", alt: "Grace Hopper" },
	{ seed: "alan-turing", alt: "Alan Turing" },
] as const;
const avatar = document.querySelector("pictum-avatar");
const avatarSeed = document.querySelector("#avatar-seed");
const shuffleAvatar = document.querySelector("#shuffle-avatar");
let identityIndex = 0;

shuffleAvatar?.addEventListener("click", () => {
	identityIndex = (identityIndex + 1) % identities.length;
	const identity = identities[identityIndex];
	if (avatar === null || avatarSeed === null || identity === undefined) {
		return;
	}
	avatar.seed = identity.seed;
	avatar.alt = identity.alt;
	avatarSeed.textContent = identity.seed;
});
