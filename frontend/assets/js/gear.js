// My Gear panel: saved objects of known length.
import { $, api, from, gsap, h, reduced, toast } from "./ui.js";

let items = [];
const listeners = new Set();

export const gearItems = () => items;
export const onGearChange = (fn) => listeners.add(fn);

async function refresh() {
	try {
		items = await api("/api/gear");
	} catch (e) {
		items = [];
	}
	render();
	listeners.forEach((fn) => fn(items));
}

function render() {
	const list = $("#gear-list");
	list.replaceChildren();
	if (!items.length) {
		list.append(h("li", { class: "empty" }, "Nothing saved yet."));
		return;
	}
	for (const g of items) list.append(row(g));
}

function row(g) {
	const li = h("li", { "data-id": g.id },
		h("span", { class: "g-name" }, g.name),
		h("span", { class: "g-len" }, `${g.length_in} in`),
		h("button", { class: "small", type: "button", onclick: () => edit(li, g) }, "Edit"),
		h("button", { class: "small", type: "button", onclick: () => remove(li, g) }, "Delete"),
	);
	return li;
}

function edit(li, g) {
	const name = h("input", { type: "text", value: g.name, maxlength: 60 });
	const len = h("input", { type: "number", value: g.length_in, min: 0.6, max: 119, step: 0.01 });
	const save = h("button", { class: "small primary", type: "button" }, "Save");
	const cancel = h("button", { class: "small", type: "button", onclick: render }, "Cancel");
	save.addEventListener("click", async () => {
		try {
			await api(`/api/gear/${g.id}`, {
				method: "PUT", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.value.trim(), length_in: parseFloat(len.value) }),
			});
			toast("Saved.", "ok", 2000);
			refresh();
		} catch (e) {
			toast(e.message);
		}
	});
	li.replaceChildren(name, len, save, cancel);
	name.focus();
}

async function remove(li, g) {
	try {
		await api(`/api/gear/${g.id}`, { method: "DELETE" });
		const done = () => refresh();
		if (gsap && !reduced) gsap.to(li, { opacity: 0, x: 30, height: 0, padding: 0, margin: 0, duration: 0.35, onComplete: done });
		else done();
	} catch (e) {
		toast(e.message);
	}
}

export function initGear() {
	$("#gear-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const name = $("#gear-name").value.trim();
		const length_in = parseFloat($("#gear-len").value);
		if (!name || !(length_in > 0)) return;
		try {
			await api("/api/gear", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, length_in }),
			});
			e.target.reset();
			await refresh();
			from("#gear-list li:last-child", { x: -30, opacity: 0, duration: 0.4, ease: "power3.out" });
		} catch (err) {
			toast(err.message);
		}
	});
	refresh();
}
