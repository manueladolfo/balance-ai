import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Balance AI',
    short_name: 'Balance AI',
    description: 'Gestión contable inteligente con Inteligencia Artificial',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a', // Ajustado al tono oscuro del tema premium
    icons: [
      {
        src: '/icon.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'maskable', // Permite que Android recorte la imagen como sea (círculo, ardilla, etc.) sin deformar el logo
      }
    ],
  };
}
