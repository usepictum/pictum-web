import { afterEach, describe, expect, test, vi } from "vitest";
import { definePictumElements } from "../src";

const definitions = definePictumElements();
const mountedElements: HTMLElement[] = [];

afterEach(() => {
	for (const element of mountedElements) {
		element.remove();
	}
	mountedElements.length = 0;
	vi.unstubAllGlobals();
});

describe("registration", () => {
	test("defines every element idempotently", () => {
		expect(customElements.get("pictum-avatar")).toBe(
			definitions["pictum-avatar"],
		);
		expect(customElements.get("pictum-icon")).toBe(definitions["pictum-icon"]);
		expect(customElements.get("pictum-placeholder")).toBe(
			definitions["pictum-placeholder"],
		);
		expect(customElements.get("pictum-qr-code")).toBe(
			definitions["pictum-qr-code"],
		);
		expect(definePictumElements()).toBe(definitions);
	});
});

describe("elements", () => {
	test("renders inline icons and caches canonical SVG requests", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" d="M1 1h22"/></svg>',
				),
			);
		vi.stubGlobal("fetch", fetchMock);
		const first = document.createElement("pictum-icon");
		first.name = "lucide:web-test-icon";
		first.baseUrl = "https://icons.example.com/v1";
		first.alt = "Test icon";
		const second = document.createElement("pictum-icon");
		second.name = "lucide:web-test-icon";
		second.baseUrl = "https://icons.example.com/v1";
		mount(first, second);

		await vi.waitFor(() => {
			expect(first.shadowRoot?.querySelector("path")).not.toBeNull();
			expect(second.shadowRoot?.querySelector("path")).not.toBeNull();
		});

		const svg = first.shadowRoot?.querySelector("svg");
		expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
		expect(svg).toHaveAttribute("part", "asset");
		expect(svg?.querySelector("path")).toHaveAttribute(
			"stroke",
			"currentColor",
		);
		expect(first.status).toBe("loaded");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("evicts failed icon requests so reconnecting can retry", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
			.mockResolvedValueOnce(
				new Response('<svg viewBox="0 0 16 16"><path d="M1 1h14"/></svg>'),
			);
		vi.stubGlobal("fetch", fetchMock);
		const element = document.createElement("pictum-icon");
		element.name = "lucide:web-retry-icon";
		element.baseUrl = "https://retry.example.com/v1";
		const errorListener = vi.fn();
		element.addEventListener("error", errorListener);
		mount(element);

		await vi.waitFor(() => {
			expect(element.status).toBe("error");
		});
		expect(errorListener).toHaveBeenCalledOnce();

		element.remove();
		document.body.append(element);

		await vi.waitFor(() => {
			expect(element.status).toBe("loaded");
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("renders avatar and QR code images and reacts to properties", async () => {
		const avatar = document.createElement("pictum-avatar");
		avatar.seed = "ada-lovelace";
		avatar.variant = "gradient";
		avatar.format = "webp";
		avatar.baseUrl = "https://assets.example.com/v1";
		avatar.alt = "Ada Lovelace";
		avatar.setAttribute("loading", "lazy");
		const qrCode = document.createElement("pictum-qr-code");
		qrCode.value = "hello";
		qrCode.baseUrl = "https://assets.example.com/v1";
		qrCode.alt = "Hello";
		Object.defineProperty(qrCode, "foreground", {
			configurable: true,
			value: "#11223344",
			writable: true,
		});
		Object.defineProperty(qrCode, "background", {
			configurable: true,
			value: "#aabbccdd",
			writable: true,
		});
		mount(avatar, qrCode);

		await vi.waitFor(() => {
			expect(avatar.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/avatar.webp?seed=ada-lovelace&variant=gradient",
			);
		});

		const avatarImage = avatar.shadowRoot?.querySelector("img");
		expect(avatarImage).toHaveAttribute("loading", "lazy");
		expect(avatarImage).toHaveAttribute("part", "asset");
		expect(qrCode.shadowRoot?.querySelector("img")).toHaveAttribute(
			"src",
			"https://assets.example.com/v1/qrcode.svg?data=aGVsbG8%3D&foreground=%2311223344&background=%23aabbccdd",
		);
		expect(qrCode.quietZone).toBeNull();
		expect(qrCode.foreground).toBe("#11223344");
		expect(qrCode.background).toBe("#aabbccdd");
		expect(qrCode).toHaveAttribute("foreground", "#11223344");
		expect(qrCode).toHaveAttribute("background", "#aabbccdd");
		expect(qrCode.shadowRoot?.querySelector("img")).not.toHaveAttribute(
			"foreground",
		);
		expect(qrCode.shadowRoot?.querySelector("img")).not.toHaveAttribute(
			"background",
		);

		qrCode.quietZone = false;
		qrCode.format = "jpg";
		expect(qrCode.quietZone).toBe(false);
		expect(qrCode).toHaveAttribute("quiet-zone", "false");
		await vi.waitFor(() => {
			expect(qrCode.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/qrcode.jpg?data=aGVsbG8%3D&quiet_zone=0&foreground=%2311223344&background=%23aabbccdd",
			);
		});

		qrCode.setAttribute("quiet-zone", " TRUE ");
		expect(qrCode.quietZone).toBe(true);
		qrCode.quietZone = null;
		expect(qrCode).not.toHaveAttribute("quiet-zone");
		expect(qrCode.quietZone).toBeNull();
		qrCode.setAttribute("foreground", "#deadbeef");
		qrCode.background = null;
		expect(qrCode).not.toHaveAttribute("background");
		expect(qrCode.background).toBeNull();
		await vi.waitFor(() => {
			expect(qrCode.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/qrcode.jpg?data=aGVsbG8%3D&foreground=%23deadbeef",
			);
		});
		qrCode.foreground = null;
		expect(qrCode).not.toHaveAttribute("foreground");
		await vi.waitFor(() => {
			expect(qrCode.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/qrcode.jpg?data=aGVsbG8%3D",
			);
		});

		avatar.seed = "grace-hopper";
		await vi.waitFor(() => {
			expect(avatar.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/avatar.webp?seed=grace-hopper&variant=gradient",
			);
		});

		avatar.variant = "portrait";
		avatar.gender = "any";
		avatar.format = null;
		await vi.waitFor(() => {
			expect(avatar.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/avatar.webp?seed=grace-hopper&variant=portrait",
			);
		});
	});

	test("uses avatar source size without forwarding it to the image", async () => {
		const avatar = document.createElement("pictum-avatar");
		avatar.seed = "customer-256";
		avatar.variant = "portrait";
		avatar.baseUrl = "https://assets.example.com/v1";
		mount(avatar);

		await vi.waitFor(() => {
			expect(avatar.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/avatar.webp?seed=customer-256&variant=portrait",
			);
		});

		avatar.size = 256;
		expect(avatar.size).toBe(256);
		expect(avatar).toHaveAttribute("size", "256");
		await vi.waitFor(() => {
			expect(avatar.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://assets.example.com/v1/avatar.webp?seed=customer-256&variant=portrait&size=256",
			);
		});
		expect(avatar.shadowRoot?.querySelector("img")).not.toHaveAttribute("size");
	});

	test("renders placeholder URLs and logical dimensions", async () => {
		const element = document.createElement("pictum-placeholder");
		element.width = 640;
		element.height = 360;
		element.format = "webp";
		element.density = 3;
		element.text = "Coming soon";
		element.alt = "Coming soon";
		mount(element);

		await vi.waitFor(() => {
			expect(element.shadowRoot?.querySelector("img")).toHaveAttribute(
				"src",
				"https://pictum.dev/v1/placeholder.webp?width=640&height=360&density=3&text=Coming+soon",
			);
		});

		const image = element.shadowRoot?.querySelector("img");
		expect(image).toHaveAttribute("width", "640");
		expect(image).toHaveAttribute("height", "360");
	});
});

function mount(...elements: HTMLElement[]): void {
	document.body.append(...elements);
	mountedElements.push(...elements);
}
