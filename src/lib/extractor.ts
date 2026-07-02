import { extractText } from 'unpdf';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Extrae texto digital de un buffer de PDF utilizando unpdf (de forma serverless compatible).
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const result = await extractText(uint8Array, { mergePages: true });
    return result.text || '';
  } catch (error) {
    console.error('Error al extraer texto digital del PDF con unpdf:', error);
    return '';
  }
}

/**
 * Realiza OCR sobre un búfer de imagen utilizando Tesseract.js de forma dinámica.
 */
export async function extractTextWithTesseract(imageBuffer: Buffer): Promise<string> {
  let worker: any = null;
  try {
    // Importar dinámicamente tesseract para evitar cargarlo en el arranque de la función
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker('spa');
    const ret = await worker.recognize(imageBuffer);
    return ret.data.text || '';
  } catch (error) {
    console.error('Error en OCR local de Tesseract:', error);
    return '';
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

/**
 * Realiza OCR de imagen utilizando la API oficial de Google Cloud Vision.
 */
export async function extractTextWithGoogleVision(imageBuffer: Buffer, apiKey: string): Promise<string> {
  try {
    const base64Image = imageBuffer.toString('base64');
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION'
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`La API de Google Vision devolvió el estado: ${response.status}`);
    }

    const result = await response.json();
    const annotation = result.responses?.[0]?.fullTextAnnotation;
    return annotation?.text || '';
  } catch (error) {
    console.error('Error en Google Cloud Vision OCR:', error);
    return '';
  }
}

/**
 * Realiza OCR de PDF utilizando la API oficial de Google Cloud Vision (v1/files:annotate).
 */
export async function extractTextFromPdfWithGoogleVision(pdfBuffer: Buffer, apiKey: string): Promise<string> {
  try {
    const base64Pdf = pdfBuffer.toString('base64');
    const response = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: {
              content: base64Pdf,
              mimeType: 'application/pdf'
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION'
              }
            ],
            pages: [1] // Procesar primera página (o más si fuera necesario)
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`La API de Google Vision Files devolvió el estado: ${response.status}`);
    }

    const result = await response.json();
    const responseItem = result.responses?.[0];
    const annotation = responseItem?.fullTextAnnotation;
    return annotation?.text || '';
  } catch (error) {
    console.error('Error en Google Cloud Vision PDF OCR:', error);
    return '';
  }
}

/**
 * Utiliza Gemini (si está configurado) como motor de OCR alternativo de alta precisión.
 */
export async function extractTextWithGemini(fileBuffer: Buffer, mimeType: string, apiKey: string): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const base64Content = fileBuffer.toString('base64');
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Content,
          mimeType: mimeType
        }
      },
      "Extrae y transcribe todo el texto e información relevante de este documento/factura de forma exacta y estructurada. Mantén los importes, fechas, conceptos y tablas. No añadas introducciones, explicaciones ni comentarios de ningún tipo. Devuelve únicamente la transcripción del texto."
    ]);
    
    return result.response.text() || '';
  } catch (error) {
    console.error('Error al extraer texto usando Gemini OCR:', error);
    return '';
  }
}
