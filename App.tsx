import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './index.css';

// Initialisation de l'API Gemini
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

export default function App() {
  const [fileData, setFileData] = useState<{ mimeType: string, data: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Gestion de l'importation de fichier (Image ou PDF)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      setFileData({ mimeType: file.type, data: base64Data });
      setResult(null);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  // Activation de la caméra arrière (mobile friendly)
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setResult(null);
      }
    } catch (err) {
      setError("Impossible d'accéder à la caméra. Veuillez vérifier les permissions.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      
      const dataUrl = canvasRef.current.toDataURL('image/jpeg');
      const base64Data = dataUrl.split(',')[1];
      
      setFileData({ mimeType: 'image/jpeg', data: base64Data });
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
  };

  // Traitement via Gemini 1.5 Flash (idéal pour le multimodal rapide)
  const processDocument = async () => {
    if (!fileData) return;
    if (!apiKey) {
      setError("Clé API manquante. Configurez VITE_GEMINI_API_KEY.");
      return;
    }

    setIsProcessing(true);
    setError('');
    
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Agis comme un extracteur de données professionnel. Analyse ce document et renvoie UNIQUEMENT un objet JSON valide contenant les clés suivantes (laisse null si l'info n'est pas trouvée) :
      - "typeDocument" (ex: facture, bon de livraison, carte d'identité)
      - "nomFournisseur"
      - "date"
      - "montantTotal"
      - "texteComplet" (l'intégralité du texte brut reconnu)
      Ne rajoute aucun texte avant ou après, pas de balises markdown.`;

      const result = await model.generateContent([
        prompt, 
        { inlineData: { data: fileData.data, mimeType: fileData.mimeType } }
      ]);
      
      const responseText = result.response.text();
      const cleanJson = responseText.replace(/```json/g, '').replace(/
```/g, '').trim();
      
      setResult(JSON.parse(cleanJson));
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'analyse du document. Assurez-vous que le document est lisible.");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    alert("Données copiées dans le presse-papiers !");
  };

  return (
    <div className="container">
      <header>
        <h1>Scanner de Documents</h1>
        <p>Prenez une photo ou uploadez un document (Image/PDF) pour extraire les données.</p>
      </header>

      <main>
        {error && <div className="error">{error}</div>}

        <div className="actions">
          <label className="btn outline">
            Importer un fichier
            <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} />
          </label>
          
          {!isCameraActive ? (
            <button className="btn outline" onClick={startCamera}>Ouvrir la caméra</button>
          ) : (
            <div className="camera-view">
              <video ref={videoRef} autoPlay playsInline></video>
              <div className="camera-controls">
                <button className="btn primary" onClick={capturePhoto}>Capturer</button>
                <button className="btn danger" onClick={stopCamera}>Annuler</button>
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

        {fileData && !isCameraActive && !result && (
          <div className="process-section">
            <p>Document prêt à être analysé.</p>
            <button className="btn primary full-width" onClick={processDocument} disabled={isProcessing}>
              {isProcessing ? 'Analyse en cours par l\'IA...' : 'Extraire les données'}
            </button>
          </div>
        )}

        {result && (
          <div className="results-card">
            <div className="results-header">
              <h2>Données Extraites</h2>
              <button className="btn small" onClick={copyToClipboard}>Copier JSON</button>
            </div>
            
            <div className="structured-data">
              <p><strong>Type :</strong> {result.typeDocument || 'Non détecté'}</p>
              <p><strong>Fournisseur :</strong> {result.nomFournisseur || 'Non détecté'}</p>
              <p><strong>Date :</strong> {result.date || 'Non détecté'}</p>
              <p><strong>Montant Total :</strong> {result.montantTotal || 'Non détecté'}</p>
            </div>
            
            <h3>Texte Brut OCR</h3>
            <div className="scrollable-text">{result.texteComplet}</div>
          </div>
        )}
      </main>
    </div>
  );
}