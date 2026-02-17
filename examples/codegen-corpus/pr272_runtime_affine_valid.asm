; ZAX lowered .asm trace
; range: $0000..$0091 (end exclusive)

; func main begin
main:
ld A, (idx)                    ; 0000: 3A 00 00
ld H, $0000                    ; 0003: 26 00
ld L, A                        ; 0005: 6F
push HL                        ; 0006: E5
pop HL                         ; 0007: E1
ld DE, $0001                   ; 0008: 11 01 00
add HL, DE                     ; 000B: 19
push HL                        ; 000C: E5
ld HL, arr                     ; 000D: 21 00 00
pop DE                         ; 0010: D1
add HL, DE                     ; 0011: 19
push HL                        ; 0012: E5
pop HL                         ; 0013: E1
ld A, (hl)                     ; 0014: 7E
ld A, (idx)                    ; 0015: 3A 00 00
ld H, $0000                    ; 0018: 26 00
ld L, A                        ; 001A: 6F
push HL                        ; 001B: E5
pop HL                         ; 001C: E1
ld DE, $0001                   ; 001D: 11 01 00
add HL, DE                     ; 0020: 19
push HL                        ; 0021: E5
ld HL, arr                     ; 0022: 21 00 00
pop DE                         ; 0025: D1
add HL, DE                     ; 0026: 19
push HL                        ; 0027: E5
pop HL                         ; 0028: E1
ld A, (hl)                     ; 0029: 7E
ld HL, (idxw)                  ; 002A: 2A 00 00
push HL                        ; 002D: E5
pop HL                         ; 002E: E1
ld DE, $0002                   ; 002F: 11 02 00
add HL, DE                     ; 0032: 19
push HL                        ; 0033: E5
ld HL, arr                     ; 0034: 21 00 00
pop DE                         ; 0037: D1
add HL, DE                     ; 0038: 19
push HL                        ; 0039: E5
pop HL                         ; 003A: E1
ld A, (hl)                     ; 003B: 7E
ld A, (idx)                    ; 003C: 3A 00 00
ld H, $0000                    ; 003F: 26 00
ld L, A                        ; 0041: 6F
push HL                        ; 0042: E5
pop HL                         ; 0043: E1
add HL, HL                     ; 0044: 29
push HL                        ; 0045: E5
ld HL, arr                     ; 0046: 21 00 00
pop DE                         ; 0049: D1
add HL, DE                     ; 004A: 19
push HL                        ; 004B: E5
pop HL                         ; 004C: E1
ld A, (hl)                     ; 004D: 7E
ld A, (idx)                    ; 004E: 3A 00 00
ld H, $0000                    ; 0051: 26 00
ld L, A                        ; 0053: 6F
push HL                        ; 0054: E5
pop HL                         ; 0055: E1
add HL, HL                     ; 0056: 29
ld DE, $0003                   ; 0057: 11 03 00
add HL, DE                     ; 005A: 19
push HL                        ; 005B: E5
ld HL, arr                     ; 005C: 21 00 00
pop DE                         ; 005F: D1
add HL, DE                     ; 0060: 19
push HL                        ; 0061: E5
pop HL                         ; 0062: E1
ld A, (hl)                     ; 0063: 7E
ld HL, arr                     ; 0064: 21 00 00
push HL                        ; 0067: E5
pop HL                         ; 0068: E1
push HL                        ; 0069: E5
ld A, (idx)                    ; 006A: 3A 00 00
ld H, $0000                    ; 006D: 26 00
ld L, A                        ; 006F: 6F
push HL                        ; 0070: E5
pop HL                         ; 0071: E1
ld DE, $0004                   ; 0072: 11 04 00
add HL, DE                     ; 0075: 19
pop DE                         ; 0076: D1
add HL, DE                     ; 0077: 19
push HL                        ; 0078: E5
pop HL                         ; 0079: E1
ld A, (hl)                     ; 007A: 7E
ld HL, arr                     ; 007B: 21 00 00
push HL                        ; 007E: E5
pop HL                         ; 007F: E1
push HL                        ; 0080: E5
ld HL, (idxw)                  ; 0081: 2A 00 00
push HL                        ; 0084: E5
pop HL                         ; 0085: E1
add HL, HL                     ; 0086: 29
ld DE, $0006                   ; 0087: 11 06 00
add HL, DE                     ; 008A: 19
pop DE                         ; 008B: D1
add HL, DE                     ; 008C: 19
push HL                        ; 008D: E5
pop HL                         ; 008E: E1
ld A, (hl)                     ; 008F: 7E
ret                            ; 0090: C9
; func main end

; symbols:
; label main = $0000
; var idx = $1000
; var idxw = $1001
; var arr = $1003
