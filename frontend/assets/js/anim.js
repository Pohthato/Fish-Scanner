// Page-level motion: a short intro, the background slideshow, number count-up.
import { $$, gsap, reduced } from "./ui.js";

export function intro() {
	if (!gsap || reduced) return;
	const paths = $$(".logo-mark .draw");
	for (const p of paths) {
		const len = p.getTotalLength();
		gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
	}
	gsap.timeline({ defaults: { ease: "power2.out" } })
		.from("#header .logo", { opacity: 0, scale: 0.9, duration: 0.5 })
		.to(paths, { strokeDashoffset: 0, duration: 0.9, stagger: 0.12, ease: "power1.inOut" }, "-=0.2")
		.from("#header .content", { opacity: 0, y: 12, duration: 0.6 }, "-=0.8")
		.from("#header .content .inner > *", { opacity: 0, y: 8, duration: 0.5, stagger: 0.06 }, "-=0.4")
		.from("#header nav", { opacity: 0, y: 8, duration: 0.5 }, "-=0.3");
}

export function countUp(el, value, format = (n) => Math.round(n).toLocaleString()) {
	if (!gsap || reduced) {
		el.textContent = format(value);
		return;
	}
	const obj = { n: 0 };
	gsap.to(obj, { n: value, duration: 1.2, ease: "power2.out", onUpdate: () => { el.textContent = format(obj.n); } });
}

// Crossfading slideshow with a slow drift. Slides after the first load
// lazily; with reduced motion it stays on the first photo.
export function slideshow() {
	const slides = $$("#bg .slide");
	if (!slides.length) return;
	const load = (s) => {
		if (!s.dataset.loaded) {
			s.style.backgroundImage = `url("${s.dataset.src}")`;
			s.dataset.loaded = "1";
		}
	};
	load(slides[0]);
	slides[0].style.opacity = 1;
	if (!gsap || reduced || slides.length < 2) return;

	const HOLD = 14;
	let i = 0;
	const drift = (s) => gsap.fromTo(s, { scale: 1.0 }, { scale: 1.06, duration: HOLD + 3, ease: "none" });
	drift(slides[0]);
	load(slides[1]);
	setInterval(() => {
		const cur = slides[i];
		i = (i + 1) % slides.length;
		const next = slides[i];
		load(next);
		load(slides[(i + 1) % slides.length]);
		drift(next);
		gsap.to(next, { opacity: 1, duration: 2, ease: "sine.inOut" });
		gsap.to(cur, { opacity: 0, duration: 2, ease: "sine.inOut" });
	}, HOLD * 1000);
}
