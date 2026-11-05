// Shared by server and client code, so it has no database or Node imports.

export const GALLERY_STATES = ["Fresh", "Healed"] as const;
export type GalleryState = (typeof GALLERY_STATES)[number];

export type GalleryItem = {
  id: string;
  src: string; // full-size image, shown when a photo is opened
  thumbSrc: string; // small image for grids
  alt: string;
  style: string;
  state: GalleryState;
  width: number;
  height: number;
  featured: boolean;
};

export const GALLERY_PAGE_SIZE = 24;
export const HOME_GALLERY_COUNT = 12;
