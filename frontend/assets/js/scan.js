// Scan panel: photo -> location/date/gear -> streamed analysis -> results.
import { readGps } from "./exif.js";
import { gearItems, onGearChange } from "./gear.js";
import { $, $$, api, from, gsap, h, reduced, svg, toast, tween } from "./ui.js";

const MAX_BYTES = 25 * 1024 * 1024;

const state = {
	file: null,
	previewUrl: null,
	loc: null, // {lat, lon, source} | {water_id, name, source: "water"}
	mode: null,
	gear: new Set(),
	manual: [], // [{x, y}] normalized 0-1
	speciesList: null,
	lastForm: null,
};

let map = null;
let marker = null;

// ------------------------------------------------------------------ stages

function stage(name) {
	const stages = { form: ".stage-form", busy: ".stage-busy", result: ".stage-result" };
	const target = $(stages[name]);
	const visible = $$(".stage").find((s) => !s.hidden);
	const swap = () => {
		$$(".stage").forEach((s) => { s.hidden = s !== target; });
		from(target, { opacity: 0, y: 18, duration: 0.45, ease: "power3.out" });
		window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
	};
	if (visible && visible !== target && gsap && !reduced) gsap.to(visible, { opacity: 0, y: -12, duration: 0.25, onComplete: () => { gsap.set(visible, { clearProps: "all" }); swap(); } });
	else swap();
}

// ------------------------------------------------------------------ photo

async function setFile(file) {
	if (!file) return;
	if (!file.type.startsWith("image/")) return toast("That isn't an image file.");
	if (file.size > MAX_BYTES) return toast("Photo is larger than 25 MB.");
	state.file = file;
	if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
	state.previewUrl = URL.createObjectURL(file);
	$("#preview-img").src = state.previewUrl;
	$("#busy-img").src = state.previewUrl;
	clearManual();
	$("#dropzone").hidden = true;
	$("#preview").hidden = false;
	$("#fields").hidden = false;
	from("#preview", { x: 40, opacity: 0, duration: 0.5, ease: "power3.out" });
	from("#fields .field", { y: 16, opacity: 0, duration: 0.4, stagger: 0.06, delay: 0.15 });

	const gps = await readGps(file);
	$("#exif-badge").hidden = !gps;
	if (gps && (!state.loc || state.loc.source === "exif")) setLocation({ ...gps, source: "exif" });
}

function resetPhoto() {
	state.file = null;
	$("#file").value = "";
	$("#dropzone").hidden = false;
	$("#preview").hidden = true;
	$("#fields").hidden = true;
	$("#exif-badge").hidden = true;
	if (state.loc?.source === "exif") setLocation(null);
}

// ------------------------------------------------------------------ location

async function setLocation(loc) {
	state.loc = loc;
	const label = $("#loc-label");
	label.classList.remove("warn");
	if (!loc) {
		label.textContent = "No location yet — statewide rules will be shown.";
		return;
	}
	if (loc.water_id) {
		label.textContent = `📍 ${loc.name}`;
		return;
	}
	if (map) placeMarker(loc.lat, loc.lon);
	label.textContent = `📍 ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)} …`;
	try {
		const info = await api(`/api/locate?lat=${loc.lat}&lon=${loc.lon}`);
		if (state.loc !== loc) return;
		label.textContent = `📍 ${info.label}${loc.source === "exif" ? " (from photo)" : ""}`;
		if (!info.in_california || info.mpa) label.classList.add("warn");
		if (info.mpa?.no_take) label.textContent += " — no-take reserve";
	} catch {
		label.textContent = `📍 ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
	}
}

function placeMarker(lat, lon) {
	if (!map) return;
	if (marker) marker.setLatLng([lat, lon]);
	else marker = window.L.marker([lat, lon]).addTo(map);
	map.setView([lat, lon], Math.max(map.getZoom(), 9));
}

function toggleMap() {
	const el = $("#map");
	el.hidden = !el.hidden;
	if (el.hidden) return;
	if (!window.L) {
		el.hidden = true;
		return toast("The map needs an internet connection. Search for a water body instead.");
	}
	if (!map) {
		map = window.L.map(el, { zoomControl: true }).setView([37.2, -119.5], 6);
		window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
			maxZoom: 17, attribution: "© OpenStreetMap contributors",
		}).addTo(map);
		map.on("click", (e) => setLocation({ lat: e.latlng.lat, lon: e.latlng.lng, source: "pin" }));
	}
	setTimeout(() => map.invalidateSize(), 50);
	if (state.loc?.lat) placeMarker(state.loc.lat, state.loc.lon);
}

function useMyLocation() {
	if (!navigator.geolocation) return toast("Location isn't available in this browser.");
	navigator.geolocation.getCurrentPosition(
		(p) => setLocation({ lat: p.coords.latitude, lon: p.coords.longitude, source: "pin" }),
		() => toast("Couldn't get your location. Drop a pin or search a water body."),
		{ enableHighAccuracy: true, timeout: 10000 },
	);
}

let searchTimer = null;
function waterSearch() {
	clearTimeout(searchTimer);
	const q = $("#water-q").value.trim();
	const list = $("#water-results");
	if (q.length < 2) return list.replaceChildren();
	searchTimer = setTimeout(async () => {
		try {
			const hits = await api(`/api/waters?q=${encodeURIComponent(q)}`);
			list.replaceChildren(...hits.map((w) => h("li", {
				onclick: () => {
					setLocation({ water_id: w.id, name: w.name, source: "water" });
					$("#water-q").value = w.name;
					list.replaceChildren();
				},
			}, w.name, h("small", {}, `${w.county} Co. · ${w.kind}`))));
			if (!hits.length) list.append(h("li", { class: "muted" }, "No match — drop a pin instead."));
		} catch (e) {
			toast(e.message);
		}
	}, 180);
}

// ------------------------------------------------------------------ gear / mode

function renderGearChips(items) {
	const box = $("#gear-chips");
	box.replaceChildren();
	if (!items.length) {
		box.append(h("span", { class: "muted" }, "No saved gear — add some under My Gear."));
		return;
	}
	for (const g of items) {
		const btn = h("button", { type: "button", class: `small ${state.gear.has(g.id) ? "is-on" : ""}` }, `${g.name} · ${g.length_in}″`);
		btn.addEventListener("click", () => {
			if (state.gear.has(g.id)) state.gear.delete(g.id);
			else state.gear.add(g.id);
			btn.classList.toggle("is-on");
		});
		box.append(btn);
	}
}

function setupMode() {
	for (const b of $$("#mode button")) {
		b.setAttribute("aria-checked", "false");
		b.addEventListener("click", () => {
			const on = state.mode !== b.dataset.mode;
			state.mode = on ? b.dataset.mode : null;
			$$("#mode button").forEach((x) => x.setAttribute("aria-checked", String(on && x === b)));
		});
	}
}

// ------------------------------------------------------------------ manual scale (two clicks)

function imageBox(img) {
	// Where the picture actually sits inside the <img> box (object-fit: contain).
	const r = img.getBoundingClientRect();
	const ratio = img.naturalWidth / img.naturalHeight;
	let w = r.width, hgt = r.width / ratio;
	if (hgt > r.height) { hgt = r.height; w = hgt * ratio; }
	return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - hgt) / 2, w, h: hgt, boxW: r.width, boxH: r.height };
}

function drawManual() {
	const layer = $("#manual-layer");
	const img = $("#preview-img");
	layer.replaceChildren();
	if (!img.naturalWidth) return;
	const b = imageBox(img);
	const r = img.getBoundingClientRect();
	layer.setAttribute("viewBox", `0 0 ${b.boxW} ${b.boxH}`);
	const pts = state.manual.map((p) => [b.left - r.left + p.x * b.w, b.top - r.top + p.y * b.h]);
	if (pts.length === 2) layer.append(svg("line", { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] }));
	for (const [x, y] of pts) layer.append(svg("circle", { cx: x, cy: y, r: 6 }));
}

function clearManual() {
	state.manual = [];
	$(".preview-img").classList.remove("picking");
	drawManual();
}

function setupManual() {
	$("#manual-start").addEventListener("click", () => {
		state.manual = [];
		drawManual();
		$(".preview-img").classList.add("picking");
		toast("Click both ends of the object in the photo.", "ok", 3000);
	});
	$("#manual-clear").addEventListener("click", clearManual);
	$("#manual-layer").addEventListener("click", (e) => {
		const b = imageBox($("#preview-img"));
		const x = (e.clientX - b.left) / b.w, y = (e.clientY - b.top) / b.h;
		if (x < 0 || x > 1 || y < 0 || y > 1) return;
		state.manual.push({ x, y });
		if (state.manual.length >= 2) {
			state.manual = state.manual.slice(-2);
			$(".preview-img").classList.remove("picking");
			$("#manual-len").focus();
		}
		drawManual();
	});
	window.addEventListener("resize", drawManual);
}

// ------------------------------------------------------------------ analyze

function buildForm(extra = {}) {
	const fd = new FormData();
	fd.append("image", state.file);
	const loc = state.loc;
	if (loc?.water_id) fd.append("water_id", loc.water_id);
	else if (loc && loc.source !== "exif") { fd.append("lat", loc.lat); fd.append("lon", loc.lon); }
	const date = $("#date").value;
	if (date) fd.append("date", date);
	if (state.mode) fd.append("mode", state.mode);
	if (state.gear.size) fd.append("gear_ids", [...state.gear].join(","));
	const len = parseFloat($("#manual-len").value);
	if (state.manual.length === 2 && len > 0) {
		const [a, b] = state.manual;
		fd.append("manual_scale", JSON.stringify({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, length_in: len }));
	}
	for (const [k, v] of Object.entries(extra)) fd.append(k, v);
	return fd;
}

async function analyze(extra = {}) {
	if (!state.file) return toast("Choose a photo first.");
	const button = $("#analyze");
	button.disabled = true;
	$$("#rail li").forEach((li) => li.classList.remove("active", "done"));
	stage("busy");
	try {
		const res = await fetch("/api/analyze/stream", { method: "POST", body: buildForm(extra) });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.error || `Upload failed (${res.status})`);
		}
		const result = await readStream(res);
		markStep(null);
		if (!result.ok) {
			stage("form");
			return toast(result.message);
		}
		renderResult(result);
		stage("result");
		animateResult();
	} catch (e) {
		stage("form");
		toast(e.message);
	} finally {
		button.disabled = false;
	}
}

async function readStream(res) {
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		let idx;
		while ((idx = buf.indexOf("\n\n")) >= 0) {
			const chunk = buf.slice(0, idx);
			buf = buf.slice(idx + 2);
			const event = /^event: (.*)$/m.exec(chunk)?.[1];
			const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] || "{}");
			if (event === "step") markStep(data.step);
			if (event === "result") return data;
			if (event === "error") throw new Error(data.message);
		}
	}
	throw new Error("The server closed the connection before finishing.");
}

function markStep(step) {
	let reached = false;
	for (const li of $$("#rail li")) {
		if (step === null) { li.classList.remove("active"); li.classList.add("done"); continue; }
		if (li.dataset.step === step) { reached = true; li.classList.add("active"); li.classList.remove("done"); }
		else if (!reached) { li.classList.remove("active"); li.classList.add("done"); }
	}
}

// ------------------------------------------------------------------ results

const VERDICTS = {
	KEEP: { word: "Keep", cls: "keep", icon: "check" },
	TOO_CLOSE_TO_CALL: { word: "Too close to call", cls: "close", icon: "warn" },
	UNCERTAIN_SPECIES: { word: "Confirm the species", cls: "close", icon: "question" },
	CHECK_REGS: { word: "Check the rules", cls: "check", icon: "question" },
	RELEASE_UNDERSIZED: { word: "Release — undersized", cls: "release", icon: "x" },
	RELEASE_OVERSIZED: { word: "Release — oversized", cls: "release", icon: "x" },
	PROHIBITED: { word: "Release — protected", cls: "release", icon: "x" },
	SEASON_CLOSED: { word: "Release — season closed", cls: "release", icon: "x" },
	MPA_NO_TAKE: { word: "Release — marine reserve", cls: "release", icon: "x" },
};
const ICONS = {
	check: "M8 17 L14 23 L25 10",
	x: "M10 10 L22 22 M22 10 L10 22",
	warn: "M16 7 L16 18 M16 24 L16 24.5",
	question: "M11.5 11.5 a4.5 4.5 0 1 1 6.5 4 c-1.5 .8 -2 1.7 -2 3.5 M16 24 L16 24.5",
};
const HAZARDS = {
	venomous_spines: "Venomous spines", sharp_teeth: "Sharp teeth", sharp_gill_covers: "Sharp gill covers",
	spines: "Sharp spines", barbels: "Stinging spines", toxic_skin: "Toxic roe/skin",
};
const verdictTag = (v) => {
	const info = VERDICTS[v] || { word: "Pick species", cls: "check" };
	const short = { keep: "Keep", close: "Too close", check: "Check", release: "Release" }[info.cls] || "—";
	return h("span", { class: `v v-${info.cls}` }, v === "UNCERTAIN_SPECIES" ? "Confirm" : short);
};

function renderResult(r) {
	const banners = $("#banners");
	banners.replaceChildren();
	const place = r.place;
	banners.append(h("div", { class: "banner info" },
		`📍 ${place.label}`, place.source === "exif" ? " · from photo GPS" : "", " · ", new Date(r.date + "T12:00").toLocaleDateString()));
	for (const w of place.warnings) banners.append(h("div", { class: "banner warn" }, w));
	if (r.stale) banners.append(h("div", { class: "banner warn" }, `⚠ ${r.stale_message}`));
	for (const n of r.scale_notes) banners.append(h("div", { class: "banner warn" }, n));
	for (const n of r.notes) banners.append(h("div", { class: "banner info" }, n));

	const box = $("#results");
	box.replaceChildren(...r.fish.map((f) => fishCard(f, r)));
	$("#disclaimer").textContent = r.disclaimer;
}

function fishCard(f, r) {
	const card = h("section", { class: "fish-card" });
	if (r.fish.length > 1) card.append(h("div", { class: "fish-head" }, h("span", { class: "num" }, `Fish #${f.number}`)));
	card.append(verdictCard(f));
	card.append(annotatedPhoto(f, r));
	card.append(h("div", { class: "result-grid" }, gauge(f, r), speciesCard(f)));
	if (f.regulations?.length) card.append(regsTable(f));
	return card;
}

function verdictCard(f) {
	const info = VERDICTS[f.verdict] || { word: "Pick the species", cls: "none", icon: "question" };
	const icon = svg("svg", { viewBox: "0 0 32 32" });
	const path = svg("path", { d: ICONS[info.icon], class: "glyph" });
	icon.append(path);
	return h("div", { class: `verdict tone-${info.cls}` },
		h("div", { class: "wash" }),
		h("div", { class: "icon" }, icon),
		h("div", { class: "text" },
			h("div", { class: "word" }, info.word),
			h("ul", { class: "why" }, (f.reasons || []).map((t) => h("li", {}, t)))));
}

function annotatedPhoto(f, r) {
	const { width: W, height: H } = r.image;
	const wrap = h("div", { class: "annot" });
	wrap.append(h("img", { src: `data:image/jpeg;base64,${r.image.jpeg}`, alt: `Fish ${f.number} outlined` }));
	const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
	const k = Math.max(W, H) / 900;
	if (r.scale?.outline?.length > 1) {
		const pts = r.scale.outline.map((p) => p.join(",")).join(" ");
		s.append(svg(r.scale.source === "manual" ? "polyline" : "polygon",
			{ points: pts, class: "ref draw", "stroke-width": 3 * k }));
	}
	if (f.outline?.length) {
		s.append(svg("polygon", { points: f.outline.map((p) => p.join(",")).join(" "), class: "outline draw", "stroke-width": 3 * k }));
	}
	if (f.length) {
		s.append(svg("polyline", { points: f.length.midline.map((p) => p.join(",")).join(" "), class: "midline draw", "stroke-width": 4 * k }));
		for (const p of [f.length.snout, f.length.tail]) s.append(svg("circle", { cx: p[0], cy: p[1], r: 7 * k, class: "end", "stroke-width": 3 * k }));
	}
	wrap.append(s);
	if (r.scale) wrap.append(h("span", { class: "caption" }, `Scale: ${r.scale.detail || r.scale.source}`));
	return wrap;
}

// Limits to mark on the ruler: the most likely species first, plus the
// governing lookalike's if it has different ones.
function rulerLimits(f) {
	const out = [];
	const seen = new Set();
	const regs = f.regulations || [];
	const add = (reg) => {
		const s = reg?.size;
		if (!s) return;
		for (const [name, v] of [["min", s.min], ["max", s.max]]) {
			if (v == null || seen.has(`${name}${v}`)) continue;
			seen.add(`${name}${v}`);
			out.push({ name, v, who: regs.length > 1 ? reg.name : "" });
		}
	};
	add(regs[0]);
	add(regs.find((x) => x.species === f.governing_species));
	return out;
}

function gauge(f, r) {
	const panel = h("div", { class: "panel" }, h("h4", {}, "Length"));
	const L = f.length;
	if (!L) {
		panel.append(h("p", { class: "muted" }, r.scale ? "This fish couldn't be measured." : "No scale available — add a reference object or use two clicks."));
		return panel;
	}
	const kind = L.kind === "FL" ? "fork length" : "total length";
	panel.append(h("div", { class: "gauge" },
		h("div", { class: "value" }, L.truncated ? `≥ ${L.low.toFixed(1)}` : L.value.toFixed(1), h("small", {}, ` in ${kind}`)),
		h("div", { class: "muted" }, L.truncated ? "Fish runs off the edge of the photo" : `range ${L.low.toFixed(1)}–${L.high.toFixed(1)} in (95%)`)));

	const limits = rulerLimits(f);
	const hi = L.high ?? L.low * 1.25;
	const top = Math.max(hi, ...limits.map((x) => x.v)) * 1.25 || 10;
	const pct = (v) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
	const ruler = h("div", { class: "ruler" }, h("div", { class: "track" }), h("div", { class: "ticks" }));
	const band = h("div", { class: "band", style: `left:${pct(L.low)};width:calc(${pct(hi)} - ${pct(L.low)})` });
	ruler.append(band);
	for (const { name, v, who } of limits) {
		if (L.low < v && hi > v) {
			const width = Math.min(Math.abs(v - L.low), Math.abs(hi - v)) * 0.9;
			ruler.append(h("div", { class: "overlap", style: `left:calc(${pct(v)} - ${(width / top) * 50}%);width:${(width / top) * 100}%` }));
		}
		ruler.append(h("div", { class: "limit", style: `left:${pct(v)}`, title: who }, h("span", {}, `${name} ${v}″`)));
	}
	panel.append(ruler);
	if (r.scale) panel.append(h("div", { class: "scale-src" }, `Scale from ${r.scale.source === "reference" ? r.scale.detail : r.scale.source}${r.scale.source === "depth" ? " (rough)" : ""}`));
	return panel;
}

function speciesCard(f) {
	const panel = h("div", { class: "panel" }, h("h4", {}, "Species"));
	const top = f.species?.[0];
	if (top) {
		panel.append(h("div", { class: "sp-top" },
			h("span", { class: "sp-name" }, top.name),
			h("span", { class: "sp-sci" }, top.scientific)));
		if (f.species_source === "model") {
			panel.append(h("ul", { class: "bars" }, f.species.map((s) => h("li", {},
				h("div", { class: "row" }, h("span", {}, s.name), h("span", {}, `${Math.round(s.prob * 100)}%`)),
				h("div", { class: "bar" }, h("i", { "data-w": Math.round(s.prob * 100) }))))));
		}
		const hazards = (top.hazards || []).map((z) => h("span", { class: "hazard pulse" }, `⚠ ${HAZARDS[z] || z}`));
		if (hazards.length) panel.append(h("div", { class: "hazards" }, hazards));
		const look = (top.lookalikes || []).slice(0, 3);
		if (look.length) panel.append(h("p", { class: "lookalike" }, `Often confused with: ${look.map(nameOf).join(", ")}. Check before keeping.`));
	} else {
		panel.append(h("p", { class: "muted" }, "Species not identified."));
	}
	panel.append(speciesPicker(f));
	return panel;
}

function nameOf(id) {
	const s = state.speciesList?.find((x) => x.id === id);
	return s ? s.name : id.replace(/_/g, " ");
}

function speciesPicker(f) {
	const select = h("select", { "aria-label": "Choose species" },
		h("option", { value: "" }, f.species?.length ? "Not right? Choose the species…" : "Choose the species…"),
		(state.speciesList || []).map((s) => h("option", { value: s.id }, `${s.name} — ${s.scientific}`)));
	const go = h("button", { type: "button", class: "small" }, "Re-check");
	go.addEventListener("click", () => {
		if (!select.value) return toast("Pick a species from the list.");
		analyze({ species_id: select.value });
	});
	return h("div", { class: "pick" }, select, go);
}

function sizeText(size) {
	if (!size || (size.min == null && size.max == null)) return "No size limit";
	const parts = [];
	if (size.min != null) parts.push(`min ${size.min}″`);
	if (size.max != null) parts.push(`max ${size.max}″`);
	return `${parts.join(", ")} ${size.type || "TL"}`;
}

function regsTable(f) {
	const rows = f.regulations.map((reg) => h("tr", { class: reg.species === f.governing_species ? "governing" : "" },
		h("td", {}, h("strong", {}, reg.name)),
		h("td", {}, verdictTag(reg.verdict)),
		h("td", {}, sizeText(reg.size)),
		h("td", {}, reg.bag?.daily != null ? `${reg.bag.daily} / day` : "—", reg.bag?.note ? h("div", { class: "notes" }, reg.bag.note) : null),
		h("td", { class: "cite" },
			reg.citations.map((c) => h("a", { href: c.url, target: "_blank", rel: "noopener", title: `verified ${c.verified}` }, c.ccr)),
			reg.notes?.length ? h("div", { class: "notes" }, reg.notes.join(" ")) : null)));
	return h("table", { class: "regs" },
		h("thead", {}, h("tr", {}, ["Species", "Verdict", "Size", "Bag", "Regulation"].map((t) => h("th", {}, t)))),
		h("tbody", {}, rows));
}

function animateResult() {
	if (!gsap) return;
	$$(".bars i").forEach((i) => tween(i, { width: `${i.dataset.w}%`, duration: 1, ease: "power3.out", delay: 0.4 }));
	if (reduced) return;
	const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
	tl.from(".banner", { y: -10, opacity: 0, duration: 0.35, stagger: 0.06 })
		.from(".verdict", { y: 20, opacity: 0, scale: 0.97, duration: 0.5, stagger: 0.15 }, "-=0.1")
		.from(".verdict .wash", { scaleX: 0, duration: 0.8, ease: "power2.inOut" }, "<")
		.from(".verdict .icon", { scale: 0, rotate: -90, duration: 0.6, ease: "back.out(2)" }, "<0.1");
	for (const p of $$(".verdict .glyph")) {
		const len = p.getTotalLength();
		gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.6, delay: 0.6 });
	}
	// Outline, midline, snout and tail draw on in sequence.
	let t = 0.5;
	for (const el of $$(".annot .draw")) {
		const len = el.getTotalLength ? el.getTotalLength() : 1000;
		gsap.fromTo(el, { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0 },
			{ strokeDashoffset: 0, fillOpacity: 1, duration: 1.1, delay: t, ease: "power2.inOut", onComplete: () => gsap.set(el, { clearProps: "strokeDasharray,strokeDashoffset" }) });
		t += 0.45;
	}
	gsap.from(".annot .end", { scale: 0, transformOrigin: "50% 50%", duration: 0.4, delay: t, stagger: 0.15, ease: "back.out(3)" });
	gsap.from(".ruler .band", { scaleX: 0, duration: 1.1, delay: 0.6, ease: "power3.out" });
	gsap.from(".ruler .limit, .ruler .overlap", { opacity: 0, y: -6, duration: 0.4, delay: 1.2, stagger: 0.1 });
	gsap.from(".panel", { y: 18, opacity: 0, duration: 0.5, stagger: 0.12, delay: 0.3 });
	gsap.from(".regs tbody tr", { x: -24, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.9 });
}

function scanAnother() {
	const go = () => {
		resetPhoto();
		$("#water-q").value = "";
		stage("form");
	};
	if (gsap && !reduced) gsap.to(".stage-result > *", { opacity: 0, y: 16, duration: 0.25, stagger: 0.04, onComplete: () => { gsap.set(".stage-result > *", { clearProps: "all" }); go(); } });
	else go();
}

// ------------------------------------------------------------------ init

export function initScan() {
	const dz = $("#dropzone");
	const input = $("#file");
	input.addEventListener("change", () => setFile(input.files[0]));
	dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
	for (const ev of ["dragenter", "dragover"]) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); });
	for (const ev of ["dragleave", "drop"]) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); });
	dz.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
	window.addEventListener("paste", (e) => {
		const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
		if (file && $("#scan").classList.contains("active")) setFile(file);
	});

	$("#change-photo").addEventListener("click", resetPhoto);
	$("#use-location").addEventListener("click", useMyLocation);
	$("#toggle-map").addEventListener("click", toggleMap);
	$("#water-q").addEventListener("input", waterSearch);
	$("#analyze").addEventListener("click", () => analyze());
	$("#again").addEventListener("click", scanAnother);
	$("#date").value = new Date().toLocaleDateString("en-CA");
	$("#date").max = $("#date").value;
	setupMode();
	setupManual();
	renderGearChips(gearItems());
	onGearChange(renderGearChips);
	api("/api/species").then((list) => { state.speciesList = list; }).catch(() => {});
}
