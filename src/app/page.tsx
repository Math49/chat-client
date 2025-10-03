import Link from "next/link";

const technologies = [
  { name: "Next.js 15", description: "App Router, rendering hybride et prefetch pour la PWA." },
  { name: "HeroUI", description: "Composants accessibles pour un design responsive." },
  { name: "Socket.IO", description: "Transport temps reel pour les salons de discussion." },
  { name: "Simple-Peer", description: "Etablissement des appels audio WebRTC via le serveur Socket.IO." },
  { name: "Workbox", description: "Mise en cache fine des assets et mode hors-ligne avec fallback." },
  { name: "Notifications Web", description: "Alertes persistantes avec vibration et ouverture directe des vues." },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-blue-600">PWA temps reel</p>
          <h1 className="text-3xl font-semibold text-neutral-900">Chat Client</h1>
          <p className="text-neutral-600">
            Une Progressive Web App pour capturer, partager et discuter en direct, meme hors connexion. Rejoins un salon, envoie des photos, passe des appels audio et retrouve toutes tes captures dans la galerie locale.
          </p>
        </header>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/reception"
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Acceder a la reception
          </Link>
          <Link
            href="/camera"
            className="rounded-full border border-blue-200 px-5 py-2 text-sm font-semibold text-blue-700 hover:border-blue-400"
          >
            Ouvrir la camera
          </Link>
          <Link
            href="/gallery"
            className="rounded-full border border-emerald-200 px-5 py-2 text-sm font-semibold text-emerald-700 hover:border-emerald-400"
          >
            Voir la galerie
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-neutral-900">Technologies embarquees</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {technologies.map((tech) => (
            <li key={tech.name} className="rounded-xl border border-neutral-200 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-800">{tech.name}</p>
              <p className="mt-1 text-sm text-neutral-600">{tech.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-neutral-900">Fonctionnalites clefs</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-neutral-600">
          <li>Mode hors-ligne complet grace au precache Workbox et a l&apos;offline fallback.</li>
          <li>Stockage local des photos et synchronisation de la galerie apres reconnection.</li>
          <li>Notifications push avec vibration pour chaque message ou photo recu hors focus.</li>
          <li>Appels audio WebRTC, vibration a la reception et reponse directe depuis le navigateur.</li>
          <li>PWA installable avec manifeste personnalise et Service Worker auto-update.</li>
        </ul>
      </section>
    </div>
  );
}
