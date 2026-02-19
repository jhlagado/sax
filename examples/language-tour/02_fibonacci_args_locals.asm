; ZAX lowered .asm trace
; range: $0100..$01C1 (end exclusive)

; func fib begin
fib:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld HL, $0000                   ; 010B: 21 00 00
push HL                        ; 010E: E5
ld HL, $0001                   ; 010F: 21 01 00
push HL                        ; 0112: E5
ld HL, $0000                   ; 0113: 21 00 00
push HL                        ; 0116: E5
ld HL, $0000                   ; 0117: 21 00 00
push HL                        ; 011A: E5
__zax_while_cond_1:
jp z, __zax_while_end_2        ; 011B: CA 00 00
push DE                        ; 011E: D5
ex DE, HL                      ; 011F: EB
ld E, (IX - $000C)             ; 0120: DD 5E F4
ld D, (IX - $000B)             ; 0123: DD 56 F5
ex DE, HL                      ; 0126: EB
pop DE                         ; 0127: D1
ld E, (IX + $0004)             ; 0128: DD 5E 04
ld D, (IX + $0005)             ; 012B: DD 56 05
xor A                          ; 012E: AF
sbc HL, DE                     ; 012F: ED 52
jp nz, __zax_if_else_3         ; 0131: C2 00 00
push DE                        ; 0134: D5
ex DE, HL                      ; 0135: EB
ld E, (IX - $0008)             ; 0136: DD 5E F8
ld D, (IX - $0007)             ; 0139: DD 56 F9
ex DE, HL                      ; 013C: EB
pop DE                         ; 013D: D1
jp __zax_epilogue_0            ; 013E: C3 00 00
__zax_if_else_3:
push DE                        ; 0141: D5
ex DE, HL                      ; 0142: EB
ld E, (IX - $0008)             ; 0143: DD 5E F8
ld D, (IX - $0007)             ; 0146: DD 56 F9
ex DE, HL                      ; 0149: EB
pop DE                         ; 014A: D1
ld E, (IX - $000A)             ; 014B: DD 5E F6
ld D, (IX - $0009)             ; 014E: DD 56 F7
add HL, DE                     ; 0151: 19
push DE                        ; 0152: D5
ex DE, HL                      ; 0153: EB
ld (IX - $000E), E             ; 0154: DD 73 F2
ld (IX - $000D), D             ; 0157: DD 72 F3
ex DE, HL                      ; 015A: EB
pop DE                         ; 015B: D1
push DE                        ; 015C: D5
ex DE, HL                      ; 015D: EB
ld E, (IX - $000A)             ; 015E: DD 5E F6
ld D, (IX - $0009)             ; 0161: DD 56 F7
ex DE, HL                      ; 0164: EB
pop DE                         ; 0165: D1
push DE                        ; 0166: D5
ex DE, HL                      ; 0167: EB
ld (IX - $0008), E             ; 0168: DD 73 F8
ld (IX - $0007), D             ; 016B: DD 72 F9
ex DE, HL                      ; 016E: EB
pop DE                         ; 016F: D1
push DE                        ; 0170: D5
ex DE, HL                      ; 0171: EB
ld E, (IX - $000E)             ; 0172: DD 5E F2
ld D, (IX - $000D)             ; 0175: DD 56 F3
ex DE, HL                      ; 0178: EB
pop DE                         ; 0179: D1
push DE                        ; 017A: D5
ex DE, HL                      ; 017B: EB
ld (IX - $000A), E             ; 017C: DD 73 F6
ld (IX - $0009), D             ; 017F: DD 72 F7
ex DE, HL                      ; 0182: EB
pop DE                         ; 0183: D1
push DE                        ; 0184: D5
ex DE, HL                      ; 0185: EB
ld E, (IX - $000C)             ; 0186: DD 5E F4
ld D, (IX - $000B)             ; 0189: DD 56 F5
ex DE, HL                      ; 018C: EB
pop DE                         ; 018D: D1
inc HL                         ; 018E: 23
push DE                        ; 018F: D5
ex DE, HL                      ; 0190: EB
ld (IX - $000C), E             ; 0191: DD 73 F4
ld (IX - $000B), D             ; 0194: DD 72 F5
ex DE, HL                      ; 0197: EB
pop DE                         ; 0198: D1
ld A, $0001                    ; 0199: 3E 01
or A                           ; 019B: B7
jp __zax_while_cond_1          ; 019C: C3 00 00
__zax_while_end_2:
push DE                        ; 019F: D5
ex DE, HL                      ; 01A0: EB
ld E, (IX - $0008)             ; 01A1: DD 5E F8
ld D, (IX - $0007)             ; 01A4: DD 56 F9
ex DE, HL                      ; 01A7: EB
pop DE                         ; 01A8: D1
__zax_epilogue_0:
pop DE                         ; 01A9: D1
pop BC                         ; 01AA: C1
pop AF                         ; 01AB: F1
ld SP, IX                      ; 01AC: DD F9
pop IX                         ; 01AE: DD E1
ret                            ; 01B0: C9
; func fib end
; func main begin
main:
push AF                        ; 01B1: F5
push BC                        ; 01B2: C5
push DE                        ; 01B3: D5
ld HL, $000A                   ; 01B4: 21 0A 00
push HL                        ; 01B7: E5
call fib                       ; 01B8: CD 00 00
inc SP                         ; 01BB: 33
inc SP                         ; 01BC: 33
__zax_epilogue_5:
pop DE                         ; 01BD: D1
pop BC                         ; 01BE: C1
pop AF                         ; 01BF: F1
ret                            ; 01C0: C9
; func main end

; symbols:
; label fib = $0100
; label __zax_while_cond_1 = $011B
; label __zax_if_else_3 = $0141
; label __zax_while_end_2 = $019F
; label __zax_epilogue_0 = $01A9
; label main = $01B1
; label __zax_epilogue_5 = $01BD
