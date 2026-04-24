# RuralX-AI Diagnostic System

## Project Overview
RuralX-AI is a deployable, low-cost, and offline-capable AI diagnostic system specifically designed for rural healthcare. Evolving from a multimodal pneumonia and tuberculosis detection project, this system has been significantly upgraded to provide real-time inference, Explainable AI (XAI), and comprehensive multilingual patient reporting.

## Key Features
- **Multimodal AI Analysis**: Combines chest X-ray image analysis with patient clinical data (age, symptoms, SpO2) using optimized deep learning models.
- **Explainable AI (Grad-CAM)**: Automatically generates diagnostic heatmaps to pinpoint exact areas of concern on the X-ray, ensuring transparency and bolstering clinical confidence.
- **Automated Image Quality Assessment**: Pre-screens uploaded X-rays for blurriness, under-exposure, or general poor quality before processing, significantly reducing false positives.
- **Risk-Based Triage**: Evaluates disease probability and categorizes patients by risk level (Low, Moderate, High, Critical) to prioritize urgent interventions.
- **Multilingual Diagnostic Reports**: Automatically translates the AI findings and medical recommendations into multiple regional languages (e.g., English, Hindi, Kannada) for localized healthcare workers.
- **User-Friendly Web Interface**: Features an intuitive, browser-accessible dashboard built with Flask for streamlined patient screening and result interpretation.
- **Low-Resource & Offline-Capable** (Ongoing): Architecture is designed and currently being optimized (via model quantization) for seamless deployment on low-cost edge hardware without requiring constant internet access.

## Running the Application

### Prerequisites
Make sure your environment has Python 3.8+ installed, along with the required libraries. If you don't have them in your environment, install the generalized pipeline dependencies:
```bash
pip install torch torchvision flask opencv-python pillow numpy
```

### Starting the Server
1. Open your terminal and navigate to the inner project directory:
   ```bash
   cd sillicon-valley-multimodal-chest-main
   ```
2. Start the local Flask web server:
   ```bash
   python app.py
   ```
3. Open your web browser and navigate to `http://localhost:5000` (or `http://127.0.0.1:5000`).

## Project Structure
- `app.py`: The main Flask web server handling API requests and routing.
- `src/ruralx_pipeline.py`: Contains the primary processing pipelines including the model system predictor, image quality assessor, and the multilingual report generator.
- `train_model.py`: Training routines, dataset handling, and model quantization logic.
- `templates/` & `static/`: The frontend interface layout, styles, and dashboard logic.
- `original/` & `tasks/`: Legacy exploratory folders and previous task documentation from the original Omdena challenge.

## Acknowledgments
Originally initiated as an Omdena Silicon Valley Chapter project focused on multimodal detection utilizing the PadChest and MIMIC-III datasets.
