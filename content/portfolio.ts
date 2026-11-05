// Add real photos to /public/portfolio and fill in `src`. Items without a src show a placeholder tile.
// Export photos as JPG at roughly 1200px on the long edge; Next.js converts them to AVIF/WebP automatically.

export type PortfolioItem = {
  id: string;
  alt: string;
  style: string;
  state: "Fresh" | "Healed";
  src?: string; // e.g. "/portfolio/olive-branch.jpg"
  width?: number;
  height?: number;
};

export const portfolio: PortfolioItem[] = [
  { id: "p1", alt: "Fine line floral on the forearm", style: "Fine line", state: "Healed" },
  { id: "p2", alt: "Minimalist wave on the ankle", style: "Minimalist", state: "Fresh" },
  { id: "p3", alt: "Blackwork geometric sleeve section", style: "Blackwork", state: "Healed" },
  { id: "p4", alt: "Neo-traditional rose on the thigh", style: "Neo-traditional", state: "Fresh" },
  { id: "p5", alt: "Script lettering along the ribs", style: "Script / lettering", state: "Healed" },
  { id: "p6", alt: "Fine line moon phases on the shoulder", style: "Fine line", state: "Fresh" },
];
