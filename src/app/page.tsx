import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-neutral-800">Fonctionnalites hors ligne</h2>
        <p className="mt-2 text-neutral-600">
          Capture des photos, stockage securise sur l'appareil et acces a ta collection meme sans connexion.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/camera"
            className="group block rounded-xl border border-blue-100 bg-blue-50/80 p-5 transition hover:border-blue-300 hover:bg-blue-100"
          >
            <h3 className="text-lg font-semibold text-blue-700">Ouvrir la camera</h3>
            <p className="mt-2 text-sm text-blue-600">
              Prends une photo, elle sera automatiquement stockee et disponible hors ligne. Une notification confirme la sauvegarde.
            </p>
          </Link>
          <Link
            href="/gallery"
            className="group block rounded-xl border border-emerald-100 bg-emerald-50/80 p-5 transition hover:border-emerald-300 hover:bg-emerald-100"
          >
            <h3 className="text-lg font-semibold text-emerald-700">Voir la galerie</h3>
            <p className="mt-2 text-sm text-emerald-600">
              Retrouve toutes tes captures, supprime-les ou telecharge-les. Accessible a tout moment.
            </p>
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-800">Conseils PWA</h3>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-neutral-600">
          <li>Ajoute l'application a ton ecran d'accueil pour un acces rapide.</li>
          <li>Autorise les notifications pour recevoir la confirmation de chaque sauvegarde.</li>
          <li>Ouvre la camera et la galerie au moins une fois en ligne pour les preparer au mode hors connexion.</li>
        </ul>
      </section>
    </div>
  );
}
