// Scan panel: photo -> location/date/ruler -> streamed analysis -> report.
import { readGps } from "./exif.js";
import { gearItems, onGearChange } from "./gear.js";
import { $, $$, api, from, gsap, h, icon, reduced, svg, toast } from "./ui.js";

const MAX_BYTES = 25 * 1024 * 1024;

const state = {
	file: null,
	previewUrl: null,
	loc: null,       // {lat, lon, source} | {water_id, name, source: "water"}
	mode: null,
	gear: new Set(),
	manual: [],      // two points, normalized 0–1, picked on the form preview
	extra: {},       // overrides carried into re-runs (species_id, ignore_refs, manual_scale)
	speciesList: [],
};

let map = null;
let marker = null;

// ------------------------------------------------------------------ stages

function stage(name) {
	const target = $(`.stage-${name}`);
	$$(".stage").forEach((s) => { s.hidden = s !== target; });
	$("#scan-sub").textContent = {
		form: "Upload a photo and tell us where and how you were fishing.",
		busy: "Analyzing your photo. This takes a few seconds.",
		result: "Results for your catch.",
	}[name];
	from(target, { opacity: 0, y: 8, duration: 0.3, ease: "power2.out" });
	$("#scan").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

// ------------------------------------------------------------------ photo

async function setFile(file) {
	if (!file) return;
	if (!file.type.startsWith("image/")) return toast("That file isn't an image.");
	if (file.size > MAX_BYTES) return toast("Photos must be 25 MB or smaller.");
	state.file = file;
	state.extra = {};
	if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
	state.previewUrl = URL.createObjectURL(file);
	$("#preview-img").src = state.previewUrl;
	$("#busy-img").src = state.previewUrl;
	$("#preview-name").textContent = file.name;
	clearManual();
	$("#dropzone").hidden = true;
	$("#preview").hidden = false;
	$("#analyze").disabled = false;
	from("#preview", { opacity: 0, duration: 0.3 });

	const gps = await readGps(file);
	if (gps && (!state.loc || state.loc.source === "exif")) setLocation({ ...gps, source: "exif" });
}

function resetPhoto() {
	state.file = null;
	state.extra = {};
	$("#file").value = "";
	$("#dropzone").hidden = false;
	$("#preview").hidden = true;
	$("#analyze").disabled = true;
	if (state.loc?.source === "exif") setLocation(null);
}

// ------------------------------------------------------------------ location

function locStatus(text, kind = "") {
	const el = $("#loc-label");
	el.className = `loc-status ${kind}`;
	el.replaceChildren(icon(kind === "set" ? "check" : kind === "warn" ? "alert" : "info"), h("span", {}, text));
}

async function setLocation(loc) {
	state.loc = loc;
	if (!loc) return locStatus("No location set. Statewide rules will be used.");
	if (loc.water_id) return locStatus(loc.name, "set");
	if (map) placeMarker(loc.lat, loc.lon);
	locStatus(`${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`, "set");
	try {
		const info = await api(`/api/locate?lat=${loc.lat}&lon=${loc.lon}`);
		if (state.loc !== loc) return;
		let text = info.label + (loc.source === "exif" ? " (from photo GPS)" : "");
		if (info.mpa?.no_take) text += ". No-take marine reserve.";
		locStatus(text, !info.in_california || info.mpa ? "warn" : "set");
	} catch {
		/* keep the coordinates */
	}
}

function placeMarker(lat, lon) {
	if (!map) return;
	if (marker) marker.setLatLng([lat, lon]);
	else marker = window.L.circleMarker([lat, lon], { radius: 7, color: "#0A141B", weight: 2, fillColor: "#E9D8A6", fillOpacity: 1 }).addTo(map);
	map.setView([lat, lon], Math.max(map.getZoom(), 9));
}

function toggleMap() {
	const el = $("#map");
	el.hidden = !el.hidden;
	$("#toggle-map").classList.toggle("is-on", !el.hidden);
	if (el.hidden) return;
	if (!window.L) {
		el.hidden = true;
		return toast("The map needs an internet connection. Search for a lake or river instead.");
	}
	if (!map) {
		map = window.L.map(el, { zoomControl: true, attributionControl: true }).setView([37.2, -119.5], 6);
		window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
			maxZoom: 17, attribution: "© OpenStreetMap contributors",
		}).addTo(map);
		map.on("click", (e) => setLocation({ lat: e.latlng.lat, lon: e.latlng.lng, source: "pin" }));
	}
	setTimeout(() => map.invalidateSize(), 30);
	if (state.loc?.lat) placeMarker(state.loc.lat, state.loc.lon);
}

function useMyLocation() {
	if (!navigator.geolocation) return toast("Location isn't available in this browser.");
	locStatus("Finding your location…");
	navigator.geolocation.getCurrentPosition(
		(p) => setLocation({ lat: p.coords.latitude, lon: p.coords.longitude, source: "pin" }),
		() => { setLocation(state.loc); toast("Couldn't get your location. Drop a pin or search instead."); },
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
				role: "option",
				onclick: () => {
					setLocation({ water_id: w.id, name: w.name, source: "water" });
					$("#water-q").value = w.name;
					list.replaceChildren();
				},
			}, h("span", {}, w.name), h("small", {}, `${w.county} County · ${w.kind}`))));
			if (!hits.length) list.append(h("li", { class: "muted" }, "No matches. Drop a pin instead."));
		} catch (e) {
			toast(e.message);
		}
	}, 160);
}

// ------------------------------------------------------------------ gear / mode

function renderGearChips(items) {
	const box = $("#gear-chips");
	box.replaceChildren();
	for (const g of items) {
		const btn = h("button", { type: "button", class: `btn btn-secondary btn-sm ${state.gear.has(g.id) ? "is-on" : ""}`, "aria-pressed": String(state.gear.has(g.id)) },
			`${g.name} · ${g.length_in} in`);
		btn.addEventListener("click", () => {
			const on = !state.gear.has(g.id);
			if (on) state.gear.add(g.id); else state.gear.delete(g.id);
			btn.classList.toggle("is-on", on);
			btn.setAttribute("aria-pressed", String(on));
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

// ------------------------------------------------------------------ two-point measuring (form)

// Where the picture actually sits inside an <img> box (object-fit: contain).
function imageBox(img) {
	const r = img.getBoundingClientRect();
	const ratio = img.naturalWidth / img.naturalHeight;
	let w = r.width, hh = r.width / ratio;
	if (hh > r.height) { hh = r.height; w = hh * ratio; }
	return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - hh) / 2, w, h: hh, r };
}

function drawPoints(layer, img, points) {
	layer.replaceChildren();
	if (!img.naturalWidth) return;
	const b = imageBox(img);
	layer.setAttribute("viewBox", `0 0 ${b.r.width} ${b.r.height}`);
	const pts = points.map((p) => [b.left - b.r.left + p.x * b.w, b.top - b.r.top + p.y * b.h]);
	if (pts.length === 2) layer.append(svg("line", { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] }));
	for (const [x, y] of pts) layer.append(svg("circle", { cx: x, cy: y, r: 5 }));
}

function clearManual() {
	state.manual = [];
	$(".preview-img").classList.remove("picking");
	$("#manual-clear").hidden = true;
	drawPoints($("#manual-layer"), $("#preview-img"), []);
}

function setupManual() {
	const layer = $("#manual-layer");
	$("#manual-start").addEventListener("click", () => {
		if (!state.file) return toast("Add a photo first.");
		state.manual = [];
		drawPoints(layer, $("#preview-img"), []);
		$(".preview-img").classList.add("picking");
		toast("Click both ends of the object in the photo.", "ok", 3000);
	});
	layer.addEventListener("click", (e) => {
		if (!$(".preview-img").classList.contains("picking")) return;
		const b = imageBox($("#preview-img"));
		const x = (e.clientX - b.left) / b.w, y = (e.clientY - b.top) / b.h;
		if (x < 0 || x > 1 || y < 0 || y > 1) return;
		state.manual.push({ x, y });
		if (state.manual.length === 2) {
			$(".preview-img").classList.remove("picking");
			$("#manual-clear").hidden = false;
			$("#manual-len").focus();
		}
		drawPoints(layer, $("#preview-img"), state.manual);
	});
	$("#manual-clear").addEventListener("click", clearManual);
	window.addEventListener("resize", () => drawPoints(layer, $("#preview-img"), state.manual));
}

// ------------------------------------------------------------------ analyze

function buildForm(extra) {
	const fd = new FormData();
	fd.append("image", state.file);
	const loc = state.loc;
	if (loc?.water_id) fd.append("water_id", loc.water_id);
	else if (loc && loc.source !== "exif") { fd.append("lat", loc.lat); fd.append("lon", loc.lon); }
	if ($("#date").value) fd.append("date", $("#date").value);
	if (state.mode) fd.append("mode", state.mode);
	if (state.gear.size) fd.append("gear_ids", [...state.gear].join(","));
	const len = parseFloat($("#manual-len").value);
	if (!extra.manual_scale && state.manual.length === 2 && len > 0) {
		const [a, b] = state.manual;
		fd.append("manual_scale", JSON.stringify({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, length_in: len }));
	}
	for (const [k, v] of Object.entries(extra)) fd.append(k, v);
	return fd;
}

async function analyze(extra = {}) {
	if (!state.file) return toast("Add a photo first.");
	state.extra = { ...state.extra, ...extra };
	$("#analyze").disabled = true;
	$$("#rail li").forEach((li) => li.classList.remove("active", "done"));
	stage("busy");
	try {
		const res = await fetch("/api/analyze/stream", { method: "POST", body: buildForm(state.extra) });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.error || `Upload failed (${res.status})`);
		}
		const result = await readStream(res);
		markStep(null);
		if (!result.ok) {
			stage("form");
			return toast(result.message, "error", 9000);
		}
		renderResult(result);
		stage("result");
		animateResult();
	} catch (e) {
		stage("form");
		toast(e.message);
	} finally {
		$("#analyze").disabled = !state.file;
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

// ------------------------------------------------------------------ report

const VERDICTS = {
	KEEP: { title: "Keep", tone: "keep", icon: "check", tag: "Keep" },
	TOO_CLOSE_TO_CALL: { title: "Too close to call", tone: "close", icon: "ruler", tag: "Too close" },
	UNCERTAIN_SPECIES: { title: "Confirm the species", tone: "close", icon: "help", tag: "Confirm" },
	CHECK_REGS: { title: "Check the local rules", tone: "check", icon: "book", tag: "Check rules" },
	RELEASE_UNDERSIZED: { title: "Release: undersized", tone: "release", icon: "x", tag: "Release" },
	RELEASE_OVERSIZED: { title: "Release: oversized", tone: "release", icon: "x", tag: "Release" },
	PROHIBITED: { title: "Release: protected species", tone: "release", icon: "x", tag: "Release" },
	SEASON_CLOSED: { title: "Release: season closed", tone: "release", icon: "x", tag: "Release" },
	MPA_NO_TAKE: { title: "Release: marine reserve", tone: "release", icon: "x", tag: "Release" },
};
const NO_VERDICT = { title: "Choose the species", tone: "none", icon: "help", tag: "—" };
const HAZARDS = {
	venomous_spines: "Venomous spines", sharp_teeth: "Sharp teeth", sharp_gill_covers: "Sharp gill covers",
	spines: "Sharp spines", barbels: "Stinging spines", toxic_skin: "Toxic roe",
};
const MODES = { boat: "from a boat", shore: "from shore", dive: "diving" };

const fmtIn = (v) => `${(+v).toFixed(1)} in`;
const nameOf = (id) => state.speciesList.find((s) => s.id === id)?.name || id.replace(/_/g, " ");

function renderResult(r) {
	$("#results").replaceChildren(...r.fish.map((f, i) => fishSection(f, r, i)));
	$("#disclaimer").textContent = r.disclaimer;
}

function notices(r) {
	const out = [];
	const add = (text, kind = "warn") => out.push(h("div", { class: `notice ${kind}` }, icon(kind === "warn" ? "alert" : "info"), h("span", {}, text)));
	for (const w of r.place.warnings) add(w);
	if (r.stale) add(r.stale_message);
	for (const n of r.notes) add(n, "info");
	return out;
}

function fishSection(f, r, i) {
	const v = VERDICTS[f.verdict] || NO_VERDICT;
	const top = f.species?.[0];
	const kicker = [r.fish.length > 1 ? `Fish ${f.number} of ${r.fish.length}` : null, top?.name].filter(Boolean).join(" · ");
	return h("section", { class: "result" },
		h("div", { class: `verdict tone-${v.tone}` },
			h("span", { class: "verdict-icon" }, icon(v.icon)),
			h("div", {},
				kicker ? h("p", { class: "verdict-kicker" }, kicker) : null,
				h("h3", { class: "verdict-title" }, v.title),
				h("ul", { class: "verdict-reasons" }, (f.reasons || []).map((t) => h("li", {}, t))))),
		i === 0 ? notices(r) : null,
		h("div", { class: "result-body" },
			h("div", { class: "result-photo" }, photoBlock(f, r)),
			h("div", { class: "result-facts" }, facts(f, r))),
		f.regulations?.length ? rulesBlock(f) : null);
}

// ---- photo with outline, midline and the ruler object

function photoBlock(f, r) {
	const { width: W, height: H } = r.image;
	const k = Math.max(W, H) / 1000;
	const wrap = h("div", { class: "annot" });
	const img = h("img", { src: `data:image/jpeg;base64,${r.image.jpeg}`, alt: `Photo with fish ${f.number} outlined` });
	const overlay = svg("svg", { class: "overlay", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
	if (r.scale?.outline?.length > 1) {
		const pts = r.scale.outline.map((p) => p.join(",")).join(" ");
		overlay.append(svg(r.scale.source === "manual" ? "polyline" : "polygon", { points: pts, class: "ref draw", "stroke-width": 2.5 * k }));
	}
	if (f.outline?.length) overlay.append(svg("polygon", { points: f.outline.map((p) => p.join(",")).join(" "), class: "outline draw", "stroke-width": 2.5 * k }));
	if (f.length) {
		overlay.append(svg("polyline", { points: f.length.midline.map((p) => p.join(",")).join(" "), class: "midline draw", "stroke-width": 3 * k }));
		for (const p of [f.length.snout, f.length.tail]) overlay.append(svg("circle", { cx: p[0], cy: p[1], r: 6 * k, class: "end", "stroke-width": 2.5 * k }));
	}
	const picks = svg("g");
	overlay.append(picks);
	wrap.append(img, overlay);

	const legend = h("div", { class: "photo-legend" },
		h("span", { style: "--c:#5FC3D4" }, "Outline"),
		f.length ? h("span", { style: "--c:var(--accent)" }, "Measured length") : null,
		r.scale?.outline?.length ? h("span", { style: "--c:var(--accent)" }, `Ruler: ${r.scale.detail || r.scale.source}`) : null);

	// Measure by marking a known length on this photo.
	const points = [];
	const lenInput = h("input", { type: "number", min: 0.5, step: 0.01, placeholder: "Length", "aria-label": "Known length in inches" });
	const markBtn = h("button", { type: "button", class: "btn btn-secondary btn-sm" }, icon("target"), "Mark two points");
	const goBtn = h("button", { type: "button", class: "btn btn-primary btn-sm", disabled: true }, "Recalculate");
	const drawPicks = () => {
		picks.replaceChildren();
		const pts = points.map((p) => [p.x * W, p.y * H]);
		if (pts.length === 2) picks.append(svg("line", { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1], class: "pick-line", "stroke-width": 2.5 * k }));
		for (const [x, y] of pts) picks.append(svg("circle", { cx: x, cy: y, r: 6 * k, class: "pick-pt", "stroke-width": 2 * k }));
		goBtn.disabled = !(points.length === 2 && parseFloat(lenInput.value) > 0);
	};
	lenInput.addEventListener("input", drawPicks);
	markBtn.addEventListener("click", () => {
		points.length = 0;
		drawPicks();
		wrap.classList.add("picking");
		toast("Click both ends of the object in the photo.", "ok", 3000);
	});
	overlay.addEventListener("click", (e) => {
		if (!wrap.classList.contains("picking")) return;
		const b = img.getBoundingClientRect();
		points.push({ x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height });
		if (points.length === 2) { wrap.classList.remove("picking"); lenInput.focus(); }
		drawPicks();
	});
	goBtn.addEventListener("click", () => {
		const [a, b] = points;
		analyze({ manual_scale: JSON.stringify({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, length_in: parseFloat(lenInput.value) }) });
	});
	const measure = h("div", { class: "measure-box" },
		h("strong", {}, f.length ? "Measure against something else" : "Add a known length to measure this fish"),
		h("p", {}, "Mark both ends of anything in the photo whose length you know, such as a rod handle, a can, or a cooler lid, then enter that length."),
		h("div", { class: "manual-row" }, markBtn, h("label", { class: "input-unit" }, lenInput, h("span", {}, "in")), goBtn));

	const blocks = [wrap, legend, measure];
	if (r.scale?.source === "reference") {
		blocks.push(h("p", { class: "inline-note" }, icon("info"),
			h("span", {}, `Measured against the ${r.scale.detail} found in the photo. `,
				h("button", { type: "button", class: "btn-link", onclick: () => analyze({ ignore_refs: "true" }) }, "Not a real one? Ignore it"))));
	}
	return blocks;
}

// ---- facts column

function fact(label, ...content) {
	return h("div", { class: "fact" }, h("dt", {}, label), h("dd", {}, ...content));
}

function facts(f, r) {
	const dl = h("dl", { class: "facts" });
	dl.append(speciesFact(f), lengthFact(f, r));
	const gov = f.regulations?.find((x) => x.species === f.governing_species) || f.regulations?.[0];
	if (gov) {
		dl.append(fact("Limits",
			h("div", { class: "fact-main" }, sizeText(gov.size)),
			h("div", { class: "fact-sub" }, gov.bag?.daily != null ? `${gov.bag.daily} per day` : gov.bag?.note || "No specific bag limit"),
			gov.species !== f.species?.[0]?.id ? h("div", { class: "fact-sub" }, `Rules for ${gov.name}, the strictest possibility`) : null));
	}
	const when = new Date(r.date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
	dl.append(fact("Where & when",
		h("div", { class: "fact-main" }, r.place.label),
		h("div", { class: "fact-sub" }, [when, r.mode ? MODES[r.mode] : "fishing mode not set", r.place.source === "exif" ? "location from photo GPS" : null].filter(Boolean).join(" · "))));
	return dl;
}

function speciesFact(f) {
	const top = f.species?.[0];
	const select = h("select", { "aria-label": "Choose the species" },
		h("option", { value: "" }, "Choose a species…"),
		state.speciesList.map((s) => h("option", { value: s.id }, `${s.name} (${s.scientific})`)));
	const go = h("button", { type: "button", class: "btn btn-secondary btn-sm" }, "Apply");
	go.addEventListener("click", () => select.value ? analyze({ species_id: select.value }) : toast("Choose a species from the list."));
	const picker = h("div", { class: "pick", hidden: Boolean(top) }, select, go);
	if (!top) return fact("Species", h("div", { class: "fact-main" }, "Not identified"), picker);

	const parts = [h("div", { class: "fact-main" }, top.name, h("span", { class: "fact-sci" }, top.scientific))];
	if (f.species_source === "manual") {
		parts.push(h("div", { class: "fact-sub" }, "Chosen by you"));
	} else if (f.species?.length) {
		parts.push(h("ul", { class: "alts" }, f.species.map((s) => h("li", {},
			h("span", {}, s.name), h("span", { class: "pct" }, `${Math.round(s.prob * 100)}%`),
			h("span", { class: "bar" }, h("i", { "data-w": Math.max(1, Math.round(s.prob * 100)) }))))));
	}
	const flags = (top.hazards || []).map((z) => h("span", { class: "flag flag-warn" }, icon("alert"), HAZARDS[z] || z));
	if (top.protected) flags.unshift(h("span", { class: "flag flag-warn" }, "Protected"));
	if (flags.length) parts.push(h("div", { class: "flags" }, flags));
	const look = (top.lookalikes || []).slice(0, 3);
	if (look.length) parts.push(h("div", { class: "fact-sub" }, `Easily confused with ${look.map(nameOf).join(", ")}.`));
	const reveal = h("button", { type: "button", class: "btn-link", style: "margin-top:8px" }, "Wrong species?");
	reveal.addEventListener("click", () => { picker.hidden = false; reveal.remove(); select.focus(); });
	parts.push(reveal, picker);
	return fact("Species", ...parts);
}

function rulerLimits(f) {
	const out = [];
	const seen = new Set();
	for (const reg of [f.regulations?.[0], f.regulations?.find((x) => x.species === f.governing_species)]) {
		const s = reg?.size;
		if (!s) continue;
		for (const [kind, v] of [["min", s.min], ["max", s.max]]) {
			if (v == null || seen.has(kind + v)) continue;
			seen.add(kind + v);
			out.push({ kind, v });
		}
	}
	return out;
}

function lengthFact(f, r) {
	const L = f.length;
	if (!L) {
		return fact("Length",
			h("div", { class: "length-none" }, "Not measured"),
			h("div", { class: "fact-sub" }, r.scale ? "The fish outline couldn't be measured." : "Nothing of known size was found in the photo. Use the measuring tool under the photo."));
	}
	const kind = L.kind === "FL" ? "fork length" : "total length";
	const value = L.truncated ? `≥ ${L.low.toFixed(1)}` : L.value.toFixed(1);
	const limits = rulerLimits(f);
	const hi = L.high ?? L.low * 1.25;
	const top = Math.max(hi, ...limits.map((x) => x.v)) * 1.2 || 10;
	const pct = (v) => `${Math.min(100, Math.max(0, (v / top) * 100)).toFixed(2)}%`;
	const ruler = h("div", { class: "ruler", "aria-hidden": "true" }, h("div", { class: "track" }), h("div", { class: "ticks" }),
		h("div", { class: "band", style: `left:${pct(L.low)};width:calc(${pct(hi)} - ${pct(L.low)})` }),
		limits.map(({ kind: k, v }) => h("div", { class: `limit ${k}`, style: `left:${pct(v)}` }, h("span", {}, `${k} ${v}″`))));
	const source = { reference: r.scale?.detail, gear: r.scale?.detail, manual: "your two points", depth: "a distance estimate (rough)" }[r.scale?.source] || r.scale?.source;
	return fact("Length",
		h("div", { class: "length-value" }, value, h("small", {}, `in ${kind}`)),
		h("div", { class: "fact-sub" }, L.truncated ? "The fish runs off the edge of the photo." : `Likely between ${fmtIn(L.low)} and ${fmtIn(hi)}`),
		ruler,
		h("div", { class: "fact-sub" }, `Scale from ${source}`));
}

function sizeText(size) {
	if (!size || (size.min == null && size.max == null)) return "No size limit";
	const t = size.type === "FL" ? "fork length" : "total length";
	if (size.min != null && size.max != null) return `${size.min}–${size.max} in ${t}`;
	if (size.min != null) return `At least ${size.min} in ${t}`;
	return `Under ${size.max} in ${t}`;
}

// ---- rules table

function rulesBlock(f) {
	const rows = f.regulations.map((reg) => {
		const v = VERDICTS[reg.verdict] || NO_VERDICT;
		return h("tr", {},
			h("td", {}, reg.name),
			h("td", {}, h("span", { class: `tag tag-${v.tone}` }, v.tag)),
			h("td", { class: "nowrap" }, sizeText(reg.size)),
			h("td", {}, reg.bag?.daily != null ? `${reg.bag.daily} per day` : "—", reg.bag?.note ? h("div", { class: "sub" }, reg.bag.note) : null),
			h("td", {},
				reg.citations.map((c) => h("a", { class: "cite", href: c.url, target: "_blank", rel: "noopener", title: `Verified ${c.verified}` }, c.ccr, icon("external"))),
				reg.notes?.length ? h("div", { class: "sub" }, reg.notes.join(" ")) : null));
	});
	return h("div", { class: "rules" },
		h("h3", {}, "Regulations applied"),
		h("p", {}, f.regulations.length > 1 ? "Every species this could be is checked; the strictest result decides." : "Rules that apply to this species here and now."),
		h("table", { class: "rules-table" },
			h("thead", {}, h("tr", {}, ["Species", "Result", "Size", "Bag", "Source"].map((t) => h("th", {}, t)))),
			h("tbody", {}, rows)));
}

function animateResult() {
	$$(".alts .bar i").forEach((i) => { i.style.width = `${i.dataset.w}%`; });
	if (!gsap || reduced) return;
	gsap.from(".alts .bar i", { width: 0, duration: 0.8, ease: "power2.out", delay: 0.2, stagger: 0.05 });
	gsap.from(".verdict", { opacity: 0, x: -8, duration: 0.4, ease: "power2.out" });
	gsap.from(".ruler .band", { scaleX: 0, duration: 0.8, ease: "power2.out", delay: 0.3 });
	let t = 0.2;
	for (const el of $$(".annot .draw")) {
		const len = el.getTotalLength ? el.getTotalLength() : 1000;
		gsap.fromTo(el, { strokeDasharray: len, strokeDashoffset: len }, {
			strokeDashoffset: 0, duration: 0.9, delay: t, ease: "power1.inOut",
			onComplete: () => gsap.set(el, { clearProps: "strokeDasharray,strokeDashoffset" }),
		});
		t += 0.3;
	}
	gsap.from(".annot .end", { opacity: 0, duration: 0.3, delay: t });
}

function scanAnother() {
	resetPhoto();
	$("#water-q").value = "";
	stage("form");
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
		const file = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
		if (file && $("#scan").classList.contains("active")) setFile(file);
	});

	$("#change-photo").addEventListener("click", resetPhoto);
	$("#use-location").addEventListener("click", useMyLocation);
	$("#toggle-map").addEventListener("click", toggleMap);
	$("#water-q").addEventListener("input", waterSearch);
	document.addEventListener("click", (e) => { if (!e.target.closest(".water-search")) $("#water-results").replaceChildren(); });
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
