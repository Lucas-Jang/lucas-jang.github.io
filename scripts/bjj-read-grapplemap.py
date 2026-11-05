"""Read public-domain GrappleMap paired joint references without running its code.

Format: https://github.com/Eelis/GrappleMap/blob/master/src/persistence.cpp
Source license and pinned revision must accompany any imported reference data.
These sparse authored schematics are references, not captured/verified motion.
"""
import json,sys
from pathlib import Path
JOINTS='LeftToe RightToe LeftHeel RightHeel LeftAnkle RightAnkle LeftKnee RightKnee LeftHip RightHip LeftShoulder RightShoulder LeftElbow RightElbow LeftWrist RightWrist LeftHand RightHand LeftFingers RightFingers Core Neck Head'.split()
DIGITS='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
def read(path):
    lines=Path(path).read_text(encoding='utf8').splitlines();i=0;description=[];sequences=[];last_position=False
    while i<len(lines):
        if lines[i].startswith(' '):
            if not last_position:
                sequences.append({'line':i-len(description)+1,'description':description,'positions':[]});description=[]
            encoded=''.join(line.strip() for line in lines[i:i+4]);assert len(encoded)==276,(i,len(encoded))
            values=[(DIGITS.index(encoded[k])*62+DIGITS.index(encoded[k+1]))/1000 for k in range(0,len(encoded),2)]
            points=[[values[k]-2,values[k+1],values[k+2]-2] for k in range(0,len(values),3)]
            sequences[-1]['positions'].append([points[:23],points[23:]])
            i+=4;last_position=True
        else:description.append(lines[i]);i+=1;last_position=False
    return sequences
if __name__=='__main__':
    sequences=read(sys.argv[1])
    if len(sys.argv)>2:Path(sys.argv[2]).write_text(json.dumps({'joints':JOINTS,'sequences':sequences}),encoding='utf8')
    for index,seq in enumerate(sequences):
        title=seq['description'][0].replace('\\n',' / ')
        if any(word in title.lower() for word in ['triangle','armbar','omoplata','double leg','double-leg','bow']):print(index,len(seq['positions']),title)
