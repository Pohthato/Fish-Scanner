// Entry point: panel routing (Dimension-style), startup data, page motion.
import { countUp, intro, slideshow } from "./anim.js";
import { initGear } from "./gear.js";
import { initScan } from "./scan.js";
import { $, $$, api, gsap, h, icon, reduced, toast } from "./ui.js";

const body = document.body;
let current = null;

function show(id, { instant = false } = {}) {
	const article = $(`#main article#${id}`);
	if (!article || current === article) return;
	if (current) current.classList.remove("active");
	body.classList.add("is-article-visible");
	$("#main").classList.toggle("is-wide", article.classList.contains("wide"));
	article.classList.add("active");
	current = article;
	window.scrollTo(0, 0);
	article.dispatchEvent(new CustomEvent("panel:open"));
	if (gsap && !reduced && !instant) {
		gsap.fromTo(article, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform,opacity" });
	}
}

function hide() {
	if (!current) return;
	current.classList.remove("active");
	current = null;
	body.classList.remove("is-article-visible");
	if (gsap && !reduced) gsap.fromTo("#header", { opacity: 0 }, { opacity: 1, duration: 0.35, clearProps: "opacity" });
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
		const close = h("button", { class: "close", type: "button", "aria-label": "Close" }, icon("x"));
		close.addEventListener("click", closePanel);
		article.prepend(close);
	}
	window.addEventListener("hashchange", route);
	window.addEventListener("popstate", route);
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && current && !document.activeElement?.closest("input, select")) closePanel();
	});
}

async function loadHealth() {
	try {
		const info = await api("/api/health");
		const verified = new Date(info.regs_verified + "T12:00:00");
		const stale = (Date.now() - verified) / 86400000 > 30 || new Date().getFullYear() > info.regs_year;
		countUp($("#stat-species"), info.counts.species);
		countUp($("#stat-rules"), info.counts.rules);
		countUp($("#stat-waters"), info.counts.waters + info.counts.mpas);
		const v = $("#stat-verified");
		v.textContent = verified.toLocaleDateString(undefined, { month: "short", day: "numeric" });
		v.classList.toggle("warn", stale);
		v.title = stale ? "Regulations may be out of date" : `Verified ${verified.toLocaleDateString()}`;
		$("#eyebrow").textContent = `California sport fishing · ${info.regs_year} regulations`;
		$("#about-verified").textContent = verified.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
		const m = info.models;
		if (m.segmenter?.name) $("#about-seg").textContent = m.segmenter.name;
		if (m.classifier?.name) $("#about-cls").textContent = m.classifier.name;
	} catch {
		$("#stat-verified").textContent = "offline";
		toast("Can't reach the app server. Start it with: python -m fishid serve");
	}
}

window.addEventListener("load", () => setTimeout(() => body.classList.remove("is-preload"), 50));

slideshow();
intro();
setupPanels();
loadHealth();
initGear();
initScan();
if (location.hash) show(location.hash.slice(1), { instant: true });
