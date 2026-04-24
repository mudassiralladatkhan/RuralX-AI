import sys
import os
import io
import traceback
from PIL import Image
import numpy as np

try:
    from src.ruralx_pipeline import RuralXModelSystem
    model = RuralXModelSystem()
    img = Image.new("RGB", (300, 300), color="white")
    res = model.predict(img)
    print("Success")
except Exception as e:
    print("Error occurred:")
    traceback.print_exc()
