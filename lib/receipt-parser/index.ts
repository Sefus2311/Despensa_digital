/**
 * Contrato del parser de tickets.
 *
 * En V0.1 el usuario introduce los datos manualmente en /tickets/[id]/review,
 * pero toda la pantalla de revisión ya trabaja contra este mismo tipo de
 * resultado. Cuando se implemente la extracción real con IA/OCR (V0.2+),
 * bastará con crear una nueva implementación de `ReceiptParser` (por ejemplo
 * `AiReceiptParser`) y sustituir `mockReceiptParser` por ella en el punto de
 * uso, sin tocar el resto de la aplicación.
 */

export interface ParsedReceiptItem {
  rawName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface ParsedReceipt {
  storeName: string | null;
  purchaseDate: string | null; // ISO date (yyyy-mm-dd)
  totalAmount: number | null;
  items: ParsedReceiptItem[];
  confidence: number; // 0..1, informativo, no usado todavía en la UI
}

export interface ReceiptParser {
  /**
   * Analiza la imagen de un ticket ya subida a Storage y devuelve
   * los datos estructurados que debe revisar el usuario.
   */
  parseReceipt(imagePath: string): Promise<ParsedReceipt>;
}

/**
 * Implementación temporal para V0.1: no hace ningún análisis real.
 * Devuelve una estructura vacía para que el usuario rellene todo a mano
 * en la pantalla de revisión, validando así el flujo completo.
 */
export class MockReceiptParser implements ReceiptParser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async parseReceipt(imagePath: string): Promise<ParsedReceipt> {
    return {
      storeName: null,
      purchaseDate: new Date().toISOString().slice(0, 10),
      totalAmount: null,
      items: [],
      confidence: 0,
    };
  }
}

export const receiptParser: ReceiptParser = new MockReceiptParser();
