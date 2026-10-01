// Entry point: panel routing (Dimension-style), startup data, page motion.
import { countUp, intro, magnetic, parallax, slideshow } from "./anim.js";
import { initGear } from "./gear.js";
import { initScan } from "./scan.js";
import { $, $$, api, gsap, h, reduced, toast } from "./ui.js";

const body = document.body;
let current = null;
let busy = false;

function show(id, { instant = false } = {}) {
	const article = $(`#main article#${id}`);
	if (!article || busy) return;
	if (current === article) return;
	busy = true;
	const swap = () => {
		if (current) current.classList.remove("active");
		body.classList.add("is-article-visible");
		article.classList.add("active");
		current = article;
		window.scrollTo(0, 0);
		article.dispatchEvent(new CustomEvent("panel:open"));
		if (gsap && !reduced && !instant) {
			gsap.fromTo(article, { opacity: 0, y: 26, scale: 0.98 },
				{ opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out", clearProps: "transform",
					onComplete: () => { busy = false; } });
			gsap.from($$(":scope > *:not(.close)", article), { opacity: 0, y: 14, duration: 0.45, stagger: 0.05, delay: 0.1 });
		} else {
			busy = false;
		}
	};
	if (current && gsap && !reduced && !instant) {
		gsap.to(current, { opacity: 0, y: -10, duration: 0.2, onComplete: swap });
	} else {
		swap();
	}
}

function hide() {
	if (!current || busy) return;
	busy = true;
	const done = () => {
		current.classList.remove("active");
		current = null;
		body.classList.remove("is-article-visible");
		busy = false;
		if (gsap && !reduced) gsap.from("#header", { opacity: 0, scale: 0.97, duration: 0.45, ease: "power3.out", clearProps: "all" });
	};
	if (gsap && !reduced) gsap.to(current, { opacity: 0, y: 20, scale: 0.98, duration: 0.3, ease: "power2.in", onComplete: done });
	else done();
}

function route() {
	const id = location.hash.slice(1);
	if (id && $(`#main article#${id}`)) show(id);
	else hide();
}

function closePanel() {
	history.pushState(null, "", location.pathname);
	route();
}

function setupPanels() {
	for (const article of $$("#main article")) {
		const close = h("button", { class: "close", type: "button", "aria-label": "Close" }, "×");
		close.addEventListener("click", closePanel);
		article.prepend(close);
	}
	window.addEventListener("hashchange", route);
	window.addEventListener("popstate", route);
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && current) closePanel();
	});
	// Clicking the dimmed background outside a panel closes it.
	$("#wrapper").addEventListener("click", (e) => {
		if (current && !e.target.closest("#main article, #header, #footer")) closePanel();
	});
}

async function loadHealth() {
	$("#chip-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
	try {
		const info = await api("/api/health");
		const verified = new Date(info.regs_verified + "T12:00:00");
		const ageDays = Math.round((Date.now() - verified) / 86400000);
		const chip = $("#chip-verified");
		chip.textContent = `Regulations verified ${verified.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
		if (ageDays > 30 || new Date().getFullYear() > info.regs_year) chip.classList.add("warn");
		$("#chip-species").textContent = `${info.counts.species} California species`;
		countUp($("#stat-species"), info.counts.species);
		countUp($("#stat-rules"), info.counts.rules);
		countUp($("#stat-waters"), info.counts.waters + info.counts.mpas);
		$("#about-verified").textContent = verified.toLocaleDateString();
		const m = info.models;
		if (m.segmenter?.name) $("#about-seg").textContent = m.segmenter.name;
		if (m.classifier?.name) $("#about-cls").textContent = m.classifier.name;
	} catch (e) {
		$("#chip-verified").textContent = "Server not reachable";
		toast("Can't reach the app server. Is `python -m fishid serve` running?");
	}
}

window.addEventListener("load", () => {
	setTimeout(() => body.classList.remove("is-preload"), 100);
});

slideshow();
intro();
magnetic();
parallax();
setupPanels();
loadHealth();
initGear();
initScan();
if (location.hash) show(location.hash.slice(1), { instant: true });
