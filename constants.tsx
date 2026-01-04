import { LinkItem } from "./types";

export const STORAGE_KEY = "pentest_hub_v4_data";
export const AUTH_KEY = "pentest_hub_v4_auth";

export const DEFAULT_LINKS: LinkItem[] = [
  {
    id: "def-1",
    name: "Shodan",
    url: "https://shodan.io",
    category: "Server",
    description: "Motore di ricerca per dispositivi connessi a Internet.",
    tags: ["iot", "scanner", "osint"],
    addedAt: Date.now(),
    aiProcessingStatus: 'done'
  },
  {
    id: "def-2",
    name: "Google Dorks",
    url: "https://google.com",
    category: "Dorks",
    description: "Operatori di ricerca avanzati per trovare vulnerabilità.",
    tags: ["search", "hacking", "web"],
    addedAt: Date.now(),
    aiProcessingStatus: 'done'
  },
  {
    id: "def-3",
    name: "WiGLE",
    url: "https://wigle.net",
    category: "WiFi Networks",
    description: "Mappe e database di reti wireless globali.",
    tags: ["wireless", "wifi", "geo"],
    addedAt: Date.now(),
    aiProcessingStatus: 'done'
  },
  {
    id: "def-4",
    name: "GreyNoise",
    url: "https://viz.greynoise.io",
    category: "Threat Intelligence",
    description: "Analizza il traffico di scansione internet e il rumore di fondo.",
    tags: ["threat-intel", "logs", "analysis"],
    addedAt: Date.now(),
    aiProcessingStatus: 'done'
  },
  {
    id: "def-5",
    name: "Urlscan.io",
    url: "https://urlscan.io",
    category: "Threat Intelligence",
    description: "Sandbox per analizzare siti web e URL sospetti.",
    tags: ["phishing", "scanner", "forensics"],
    addedAt: Date.now(),
    aiProcessingStatus: 'done'
  },
  {
    id: "def-6",
    name: "Censys",
    url: "https://censys.io",
    category: "Server",
    description: "Piattaforma per scoprire e analizzare l'infrastruttura internet.",
    tags: ["assets", "attack-surface", "scanner"],
    addedAt: Date.now(),
    aiProcessingStatus: 'done'
  }
];