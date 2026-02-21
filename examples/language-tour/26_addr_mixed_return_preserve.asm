; ZAX lowered .asm trace
; range: $0100..$014C (end exclusive)

; func preserve_and_store begin
preserve_and_store:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push HL                        ; 0108: E5
ld HL, $0102                   ; 0109: 21 02 01
ex (SP), HL                    ; 010C: E3
push AF                        ; 010D: F5
push BC                        ; 010E: C5
push DE                        ; 010F: D5
push HL                        ; 0110: E5
ld e, (IX + $0004)             ; 0111: DD 5E 04
ld d, (IX + $0005)             ; 0114: DD 56 05
ld (IX - $0002), e             ; 0117: DD 73 FE
ld (IX - $0001), d             ; 011A: DD 72 FF
ex DE, HL                      ; 011D: EB
ld E, (IX - $0002)             ; 011E: DD 5E FE
ld D, (IX - $0001)             ; 0121: DD 56 FF
ex DE, HL                      ; 0124: EB
__zax_epilogue_0:
pop HL                         ; 0125: E1
pop DE                         ; 0126: D1
pop BC                         ; 0127: C1
pop AF                         ; 0128: F1
ld SP, IX                      ; 0129: DD F9
pop IX                         ; 012B: DD E1
ret                            ; 012D: C9
; func main begin
; func preserve_and_store end
main:
push IX                        ; 012E: DD E5
ld IX, $0000                   ; 0130: DD 21 00 00
add IX, SP                     ; 0134: DD 39
push AF                        ; 0136: F5
push BC                        ; 0137: C5
push DE                        ; 0138: D5
push HL                        ; 0139: E5
ld HL, $7777                   ; 013A: 21 77 77
push HL                        ; 013D: E5
call preserve_and_store        ; 013E: CD 00 00
inc SP                         ; 0141: 33
inc SP                         ; 0142: 33
__zax_epilogue_1:
pop HL                         ; 0143: E1
pop DE                         ; 0144: D1
pop BC                         ; 0145: C1
pop AF                         ; 0146: F1
ld SP, IX                      ; 0147: DD F9
pop IX                         ; 0149: DD E1
ret                            ; 014B: C9
; func main end

; symbols:
; label preserve_and_store = $0100
; label __zax_epilogue_0 = $0125
; label main = $012E
; label __zax_epilogue_1 = $0143
