export interface Source {
  name: string; // назва платформи для підпису "за матеріалами: ..."
  url: string; // адреса RSS-стрічки
}

export const sources: Source[] = [
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
];
