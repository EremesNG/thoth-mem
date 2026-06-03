/**
 * Stub for `sharp` — thoth-mem does not use image processing.
 * @huggingface/transformers imports sharp for image pre/post-processing
 * pipelines that are not exercised by the text-embedding / text-generation
 * code paths used here.  This stub prevents a native-addon resolution failure
 * at module load time while keeping all text-based functionality intact.
 */

function sharpStub() {
  throw new Error('[thoth-mem] sharp is not available — image processing is not supported.');
}

export default sharpStub;
