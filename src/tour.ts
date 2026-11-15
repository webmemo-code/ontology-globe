// Guided tour: each stop picks a view, then selects an entity or flies to a
// camera keyframe, and shows a caption. Same keyframe shape as the Periodic
// Cube's camera animations, so a moderator/avatar path can be layered on later.
import type { CameraKeyframe, View } from './three/GraphScene';

export interface TourStop {
  title: string;
  text: string;
  select?: string;
  camera?: CameraKeyframe;
  view?: View;
}

const cam = (p: [number, number, number], t: [number, number, number]): CameraKeyframe => ({
  position: { x: p[0], y: p[1], z: p[2] },
  target: { x: t[0], y: t[1], z: t[2] },
});

// Coordinates: Switzerland sits straight ahead on -z, north up; the topic wheel
// lies flat at y = 0 with the two authors on its hub; place shells run from
// r 22 (continents) to r 52 (sights) toward the skin at r 60.
export const TOUR: TourStop[] = [
  {
    title: 'One globe, every article',
    text: 'Every dot on the skin is one article, at the place it is about: orange for Travelmemo, grey for Reisememo. The dotted land is the real map, turned so Switzerland, where we live, faces you.',
    // Below the equator, looking up at Europe.
    camera: cam([16, -50, -126], [0, 10, 0]),
  },
  {
    title: 'Every country carries two bars',
    text: 'Each country carries a pair of bars, orange for Travelmemo and grey for Reisememo, as tall as the number of articles (on a log scale). Switzerland is the dense cluster in the middle.',
    select: 'places/switzerland',
  },
  {
    title: 'Step inside: every place knows its stories',
    text: 'Countries, regions, towns and sights hang inside the globe under their own spot on the map, continents nearest the centre, sights nearest the skin. Colour follows your gaze; the rest stays grey until you look at it.',
    // From just below the wheel at the centre, out through the shells towards the Alps.
    camera: cam([7, -7, 6], [0, -1, -50]),
  },
  {
    title: 'Select Zermatt and its articles light up',
    text: 'Every place is linked to the place that contains it, so an article about Zermatt also belongs to Valais, Switzerland and Europe.',
    select: 'places/zermatt',
  },
  {
    title: 'Trips trace their route',
    text: 'The Glacier Express is an entity too. Its route runs station by station from St. Moritz to Zermatt, so an article about the train is also about every stop.',
    select: 'trips/glacier-express',
  },
  {
    title: 'Topics stand on a wheel in the middle',
    text: 'Themes like food, hiking or boutique hotels have no place on the map, so they stand on a wheel at the centre, grouped by family. The further out, the more articles; the taller, the more AI agents fetch it. Select one and bold lines run to the countries where we write about it most.',
    select: 'topics/culinary-tourism',
    // From above the rim, the whole wheel and its towers at a glance.
    camera: cam([24, 15, 27], [0, 1, 0]),
  },
  {
    title: 'Every theme starts with the two of us',
    text: 'Just below the hub of the wheel are the two authors who write both blogs. Every article is signed by one of us, with the same identity on both sites.',
    // Just under the wheel's rim, looking in at the faces beneath the hub.
    camera: cam([10, -1.5, 14], [0, -3.2, 0]),
  },
  {
    title: 'Companies hang over their headquarters',
    text: 'Airlines, hotel brands and booking platforms each carry a verified Wikidata ID, so search engines and AI assistants can tell which "Swiss" we mean.',
    select: 'organizations/swiss-international-air-lines',
  },
  {
    title: 'It all comes from one small globe',
    text: 'Behind the scenes, every place, topic, company and author is one small file in a shared ontology. Together they form this small globe: the single source of truth.',
    view: 'system',
    camera: cam([30, -6, 34], [0, -14, 0]),
  },
  {
    title: 'Two blogs draw from it',
    text: 'Travelmemo (English) and Reisememo (German) tag their articles with entities from the same ontology. The box size shows how many articles each blog has.',
    view: 'system',
    camera: cam([0, 16, 52], [0, 6, 0]),
  },
  {
    title: 'One source, many outputs, many readers',
    text: 'From the ontology and the tags we generate the pages and images people see, structured data for search engines, an EntityMap and llms.txt for AI crawlers, and a knowledge bundle for every article. Search engines and AI agents pick them up from there; travelers set them in motion. Nothing is maintained twice.',
    view: 'system',
    camera: cam([0, 44, 70], [0, 28, 0]),
  },
  {
    title: 'Explore it yourself',
    text: 'Back to the globe. Click any dot, cylinder or face to drill down, or search for a place you know.',
    camera: cam([16, -50, -126], [0, 10, 0]),
  },
];
