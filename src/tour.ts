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

export const TOUR: TourStop[] = [
  {
    title: 'It starts with one small globe',
    text: 'Every place, topic, company and author our travel blogs write about is one small file in a shared ontology. Together they form this small globe: the single source of truth.',
    view: 'system',
    camera: cam([30, -6, 34], [0, -14, 0]),
  },
  {
    title: 'Two blogs draw from it',
    text: 'Travelmemo (English) and Reisememo (German) tag their articles with entities from the same ontology. The tower height shows how many articles each blog has.',
    view: 'system',
    camera: cam([0, 16, 52], [0, 6, 0]),
  },
  {
    title: 'One source, many outputs',
    text: 'From the ontology and the tags we generate the pages and images people see, structured data for Google, an EntityMap and llms.txt for AI crawlers, and a knowledge bundle for every article. Box height shows how many items each serves. Nothing is maintained twice.',
    view: 'system',
    camera: cam([0, 40, 64], [0, 26, 0]),
  },
  {
    title: 'The small globe grows into the big one',
    text: 'Every dot on its skin is one article, at the place it is about: orange for English, grey for German. Fine lines trace the real coastlines.',
  },
  {
    title: 'Every country carries two bars',
    text: 'Each country carries a pair of bars, orange for Travelmemo and grey for Reisememo, as tall as the number of articles (on a log scale). Switzerland, where we live, is the dense cluster in the middle.',
    select: 'places/switzerland',
  },
  {
    title: 'Every place knows its stories',
    text: 'Countries, regions, towns and sights hang inside the globe under their own spot on the map, each linked to the place that contains it. Select Zermatt and its articles light up.',
    select: 'places/zermatt',
  },
  {
    title: 'Trips trace their route',
    text: 'The Glacier Express is an entity too. Its route runs station by station from St. Moritz to Zermatt, so an article about the train is also about every stop.',
    select: 'trips/glacier-express',
  },
  {
    title: 'Topics are the sky',
    text: 'Look up: themes like food, hiking or boutique hotels form the ceiling. One article can be about Zurich and about restaurants at the same time, and the map records both.',
    select: 'topics/culinary-tourism',
  },
  {
    title: 'The two of us, at the zenith',
    text: 'Above everything are the two authors who write both blogs. Every article is signed by one of us, with the same identity on both sites.',
    camera: cam([0, 4, 6], [0, 44, -6]),
  },
  {
    title: 'Companies are the floor',
    text: 'Airlines, hotel brands and booking platforms each carry a verified Wikidata ID, so search engines and AI assistants can tell which "Swiss" we mean.',
    select: 'organizations/swiss-international-air-lines',
  },
  {
    title: 'Explore it yourself',
    text: 'Step back outside the globe. Click any tile, box or face to drill down, or search for a place you know.',
    camera: cam([60, 40, -140], [0, 0, 0]),
  },
];
