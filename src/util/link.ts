import kleur from "kleur";

const OSC8 = "\u001b]8;;";
const BEL = "\u0007";

export function hyperlink(text: string, url: string): string {
	if (!kleur.enabled || !url) return text;
	return `${OSC8}${url}${BEL}${text}${OSC8}${BEL}`;
}
