// My gear panel: saved objects of known length.
import { $, api, from, h, icon, toast } from "./ui.js";

let items = [];
const listeners = new Set();

export const gearItems = () => items;
export const onGearChange = (fn) => listeners.add(fn);

async function refresh() {
	try {
		items = await api("/api/gear");
	} catch {
		items = [];
	}
	render();
	listeners.forEach((fn) => fn(items));
}

function render() {
	const list = $("#gear-list");
	list.replaceChildren();
	if (!items.length) {
		list.append(h("li", { class: "empty" }, "No saved gear yet."));
		return;
	}
	for (const g of items) list.append(row(g));
}

function row(g) {
	const li = h("li", {},
		h("span", { class: "g-name" }, g.name),
		h("span", { class: "g-len" }, `${g.length_in} in`),
		h("button", { class: "icon-btn", type: "button", "aria-label": `Edit ${g.name}`, onclick: () => edit(li, g) }, icon("edit")),
		h("button", { class: "icon-btn", type: "button", "aria-label": `Delete ${g.name}`, onclick: () => remove(g) }, icon("trash")),
	);
	return li;
}

function edit(li, g) {
	const name = h("input", { type: "text", value: g.name, maxlength: 60, "aria-label": "Name" });
	const len = h("input", { type: "number", value: g.length_in, min: 0.6, max: 119, step: 0.01, "aria-label": "Length in inches" });
	const save = h("button", { class: "btn btn-primary btn-sm", type: "button" }, "Save");
	const cancel = h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: render }, "Cancel");
	save.addEventListener("click", async () => {
		try {
			await api(`/api/gear/${g.id}`, {
				method: "PUT", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.value.trim(), length_in: parseFloat(len.value) }),
			});
			refresh();
		} catch (e) {
			toast(e.message);
		}
	});
	li.classList.add("editing");
	li.replaceChildren(name, h("span", { class: "input-unit" }, len, h("span", {}, "in")), save, cancel);
	name.focus();
}

async function remove(g) {
	try {
		await api(`/api/gear/${g.id}`, { method: "DELETE" });
		refresh();
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
			from("#gear-list li:last-child", { opacity: 0, y: 6, duration: 0.25 });
		} catch (err) {
			toast(err.message);
		}
	});
	refresh();
}
