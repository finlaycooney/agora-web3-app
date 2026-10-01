"""Changing this identity requires rebuilding the index, including query vectors."""

MODEL_ID = "intfloat/multilingual-e5-small"
MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
DIMENSIONS = 384
MAX_TOKENS = 512
MAX_INPUTS = 32
MAX_BODY_BYTES = 128 * 1024
INDEX_VERSION = f"{MODEL_ID}@{MODEL_REVISION}:e5-prefix:l2:384:v1"
