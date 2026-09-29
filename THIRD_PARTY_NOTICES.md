# Third-party notices

## face-api.js

partyface uses face-api.js 0.22.2 and model assets downloaded from its pinned upstream release:

- Upstream: https://github.com/justadudewhohacks/face-api.js/tree/0.22.2
- Copyright: Vincent Mühler and upstream contributors.
- face-api.js license: MIT; the complete notice is preserved in [licenses/face-api.js-LICENSE.txt](licenses/face-api.js-LICENSE.txt).
- The download script also preserves the upstream license in `public/vendor/face-api-LICENSE.txt` for website distribution.

Third-party code and model assets retain their upstream terms; the partyface license does not relicense them.

## Other dependencies and services

Python / Pillow and platform services including GitHub, Supabase and Google Drive retain their own licenses and terms. They are not relicensed by this project.

## Photos and branding

Event photographs credited to passion lab polimi摄影社 are not covered by the source-code MIT license. ENDU is credited solely as design inspiration; its brand and website content are not included in partyface’s license.

## FaceNet512 model and ONNX Runtime Web

- FaceNet paper: https://arxiv.org/abs/1503.03832
- ONNX model distributor: https://github.com/PicPeak/picpeak/releases/tag/ml-models-v1
- Distributor describes this 512-dimensional model as a conversion of DeepFace `facenet512_weights.h5`. Its release documentation states MIT licensing; partyface records that upstream statement rather than granting new rights to the weights or training datasets.
- DeepFace source: https://github.com/serengil/deepface. Its MIT source notice is preserved in [licenses/deepface-LICENSE.txt](licenses/deepface-LICENSE.txt).
- Model SHA-256: `a1c06dcb79dc17a42af01d5bcbce4822caa148b9c24bf7eb8b8e556b4fd0d5db`.
- ONNX Runtime Web 1.22.0: https://github.com/microsoft/onnxruntime/tree/v1.22.0, MIT, Microsoft Corporation. The asset download script preserves its complete upstream license in `public/vendor/ort/LICENSE`.
- The download script includes this notice and the DeepFace notice with the public model distribution. Open-source notices do not grant permission to process event participants' biometric data.
